# Intentional violation. Repair: from ..service import list_orders
from ..storage.orders import ORDERS


def show_orders():
    return ORDERS
