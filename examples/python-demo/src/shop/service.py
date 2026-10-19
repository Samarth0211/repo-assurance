from .storage.orders import ORDERS


def list_orders():
    return [dict(order) for order in ORDERS]
