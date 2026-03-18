export interface ChargeResult {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  created: string;
}

export interface RefundResult {
  id: string;
  paymentIntentId: string;
  amount: number;
  status: string;
  reason: string;
}

export interface CustomerResult {
  id: string;
  email: string;
  name: string;
  created: string;
}
