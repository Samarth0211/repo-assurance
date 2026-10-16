import { orders } from '../storage/orders.js';
export function listOrders() { return orders.map(order => ({ ...order })); }
