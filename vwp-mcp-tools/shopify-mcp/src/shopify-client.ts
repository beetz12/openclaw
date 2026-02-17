/**
 * Lightweight Shopify Admin REST API client.
 * Uses built-in fetch (Node 22+) -- no extra HTTP dependencies needed.
 */

import type { ShopifyConfig, Product, Order, Customer, InventoryLevel } from "./types.js";

export class ShopifyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private config: ShopifyConfig) {
    const store = config.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${store}/admin/api/${config.apiVersion}`;
    this.headers = {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    };
  }

  // ---- generic request helper ----

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") {
          url.searchParams.set(k, v);
        }
      }
    }

    const res = await fetch(url.toString(), { headers: this.headers });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Shopify API ${res.status}: ${body}`);
    }

    return (await res.json()) as T;
  }

  // ---- Products ----

  async getProducts(
    opts: {
      limit?: number;
      title?: string;
      collection_id?: string;
      status?: string;
    } = {},
  ): Promise<Product[]> {
    const params: Record<string, string> = {};
    if (opts.limit) {
      params.limit = String(opts.limit);
    }
    if (opts.title) {
      params.title = opts.title;
    }
    if (opts.collection_id) {
      params.collection_id = opts.collection_id;
    }
    if (opts.status) {
      params.status = opts.status;
    }

    const data = await this.request<{ products: Product[] }>("/products.json", params);
    return data.products;
  }

  async getProduct(productId: string): Promise<Product> {
    const data = await this.request<{ product: Product }>(`/products/${productId}.json`);
    return data.product;
  }

  // ---- Orders ----

  async getOrders(
    opts: {
      limit?: number;
      status?: string;
      email?: string;
      since_id?: string;
    } = {},
  ): Promise<Order[]> {
    const params: Record<string, string> = {};
    if (opts.limit) {
      params.limit = String(opts.limit);
    }
    if (opts.status) {
      params.status = opts.status;
    }
    if (opts.email) {
      params.email = opts.email;
    }
    if (opts.since_id) {
      params.since_id = opts.since_id;
    }

    const data = await this.request<{ orders: Order[] }>("/orders.json", params);
    return data.orders;
  }

  async getOrder(orderId: string): Promise<Order> {
    const data = await this.request<{ order: Order }>(`/orders/${orderId}.json`);
    return data.order;
  }

  // ---- Customers ----

  async searchCustomers(opts: {
    email?: string;
    phone?: string;
    customer_id?: string;
  }): Promise<Customer | Customer[]> {
    if (opts.customer_id) {
      const data = await this.request<{ customer: Customer }>(
        `/customers/${opts.customer_id}.json`,
      );
      return data.customer;
    }

    // Search by email or phone
    const queryParts: string[] = [];
    if (opts.email) {
      queryParts.push(`email:${opts.email}`);
    }
    if (opts.phone) {
      queryParts.push(`phone:${opts.phone}`);
    }

    if (queryParts.length === 0) {
      throw new Error("Must provide email, phone, or customer_id");
    }

    const data = await this.request<{ customers: Customer[] }>("/customers/search.json", {
      query: queryParts.join(" "),
    });
    return data.customers;
  }

  // ---- Inventory ----

  async getInventoryLevels(
    opts: {
      product_id?: string;
      location_id?: string;
    } = {},
  ): Promise<InventoryLevel[]> {
    // If product_id is given, first get variant inventory_item_ids, then query levels
    if (opts.product_id) {
      const product = await this.getProduct(opts.product_id);
      const itemIds = product.variants
        .map((v) => v.inventory_item_id)
        .filter((id): id is number => typeof id === "number");

      if (itemIds.length === 0) {
        return [];
      }

      const params: Record<string, string> = {
        inventory_item_ids: itemIds.join(","),
      };
      if (opts.location_id) {
        params.location_ids = opts.location_id;
      }

      const data = await this.request<{ inventory_levels: InventoryLevel[] }>(
        "/inventory_levels.json",
        params,
      );
      return data.inventory_levels;
    }

    if (opts.location_id) {
      const data = await this.request<{ inventory_levels: InventoryLevel[] }>(
        `/locations/${opts.location_id}/inventory_levels.json`,
      );
      return data.inventory_levels;
    }

    throw new Error("Must provide product_id or location_id");
  }
}
