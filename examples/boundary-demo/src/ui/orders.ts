// Intentional architectural violation for the demonstration.
// Repair: import listOrders from ../service/orders.js and use listOrders().
import { orders } from '../storage/orders.js';
export function showOrders() { return orders; }
