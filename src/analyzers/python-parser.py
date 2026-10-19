"""Trusted AST extraction helper. Input is JSON source text; target modules are never imported."""
import _imp
import ast
import json
import sys


def extract(file):
    source = file["text"].removeprefix("\ufeff")
    imports = []
    diagnostics = []
    try:
        tree = ast.parse(source, filename=file["path"])
    except (SyntaxError, ValueError, RecursionError) as error:
        return {"path": file["path"], "imports": [], "parsed": False,
                "diagnostics": [{"code": "SYNTAX_ERROR", "message": str(error)}]}
    lines = source.splitlines()
    importlibs = {"importlib"}
    loaders = {"__import__"}
    systems = {"sys"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "importlib":
                    importlibs.add(alias.asname or alias.name)
                if alias.name == "sys":
                    systems.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module == "importlib" and not node.level:
            for alias in node.names:
                if alias.name == "import_module":
                    loaders.add(alias.asname or alias.name)

    def add(node, module, level=0, names=None):
        # Python AST columns are UTF-8 byte offsets; reports use character columns.
        line = lines[node.lineno - 1]
        column = len(line.encode("utf-8")[:node.col_offset].decode("utf-8")) + 1
        imports.append({"module": module, "level": level, "names": names,
                        "line": node.lineno, "column": column})

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add(node, alias.name)
        elif isinstance(node, ast.ImportFrom):
            names = [alias.name for alias in node.names]
            add(node, node.module or "", node.level, names)
            if "*" in names:
                diagnostics.append({"code": "PYTHON_STAR_IMPORT", "message":
                                    "Wildcard imports and package __all__ loading are not fully modeled (line %d)." % node.lineno})
        elif isinstance(node, ast.Call):
            func = node.func
            is_loader = (isinstance(func, ast.Name) and func.id in loaders) or (
                isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name)
                and func.value.id in importlibs and func.attr == "import_module")
            if is_loader:
                name = node.args[0] if node.args else next((k.value for k in node.keywords if k.arg == "name"), None)
                # Additional __import__ args can change package context/fromlist loading.
                complex_builtin = isinstance(func, ast.Name) and func.id == "__import__" and (
                    len(node.args) > 1 or any(k.arg != "name" for k in node.keywords))
                if isinstance(name, ast.Constant) and isinstance(name.value, str) and name.value and not name.value.startswith(".") and not complex_builtin:
                    add(node, name.value)
                else:
                    diagnostics.append({"code": "DYNAMIC_IMPORT", "message":
                                        "Computed/relative dynamic imports or contextual __import__ calls need explicit review (line %d)." % node.lineno})
            if isinstance(func, ast.Name) and func.id in {"exec", "eval"}:
                diagnostics.append({"code": "PYTHON_DYNAMIC_CODE", "message":
                                    "Dynamically evaluated code can introduce dependencies that AST analysis cannot verify (line %d)." % node.lineno})
            if isinstance(func, ast.Attribute) and func.attr in {"spec_from_file_location", "module_from_spec", "exec_module", "load_module"}:
                diagnostics.append({"code": "DYNAMIC_IMPORT", "message":
                                    "Custom module loading is not resolved (line %d)." % node.lineno})
        if (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                and node.value.id in systems and node.attr in {"path", "meta_path", "path_hooks"}) or (
                isinstance(node, ast.Name) and node.id == "__path__" and isinstance(node.ctx, (ast.Store, ast.Del))):
            diagnostics.append({"code": "PYTHON_IMPORT_PATH", "message":
                                "Custom import paths or hooks need explicit review; configure python.sourceRoots for fixed source roots (line %d)." % node.lineno})
    return {"path": file["path"], "imports": imports, "diagnostics": diagnostics, "parsed": True}


def main():
    if sys.version_info < (3, 10):
        raise RuntimeError("Python 3.10 or later is required")
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    stdlib = sorted(sys.stdlib_module_names)
    result = {"version": sys.version.split()[0], "stdlib": stdlib,
              "preloaded": sorted(set(sys.builtin_module_names) | {name for name in stdlib if _imp.is_frozen(name)}),
              "files": [extract(file) for file in payload["files"]]}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True).encode("ascii"))


if __name__ == "__main__":
    main()
