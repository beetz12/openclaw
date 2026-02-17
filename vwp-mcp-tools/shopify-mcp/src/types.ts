/** Shared types for Shopify MCP server */

export interface ShopifyConfig {
  storeUrl: string;
  accessToken: string;
  apiVersion: string;
}

// ---- Product types ----

export interface ProductVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  inventory_item_id: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ProductImage {
  id: number;
  product_id: number;
  src: string;
  alt: string | null;
  position: number;
}

export interface Product {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  status: string;
  tags: string;
  variants: ProductVariant[];
  images: ProductImage[];
  created_at: string;
  updated_at: string;
}

// ---- Order types ----

export interface OrderLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  variant_title: string | null;
  product_id: number | null;
  variant_id: number | null;
}

export interface OrderAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
}

export interface Fulfillment {
  id: number;
  order_id: number;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_company: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  order_number: number;
  email: string | null;
  phone: string | null;
  name: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: OrderLineItem[];
  shipping_address: OrderAddress | null;
  billing_address: OrderAddress | null;
  fulfillments: Fulfillment[];
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  note: string | null;
  tags: string;
}

// ---- Customer types ----

export interface Customer {
  id: number;
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  tags: string;
  state: string;
  verified_email: boolean;
  created_at: string;
  updated_at: string;
  note: string | null;
  default_address: OrderAddress | null;
}

// ---- Inventory types ----

export interface InventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
}

export interface InventoryItem {
  id: number;
  sku: string;
  tracked: boolean;
}
