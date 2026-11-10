import { CustomerAdjustmentInput, CustomerInput, CustomerPaymentInput, CustomerMovement } from '../interfaces/customer';
import { CustomerStatus } from './customer.types';

export type PendingCustomerCommand =
  | { kind: 'create' | 'update'; key: string; body: CustomerInput }
  | { kind: 'payment'; key: string; body: CustomerPaymentInput }
  | { kind: 'adjustment'; key: string; body: CustomerAdjustmentInput }
  | { kind: 'reversal'; key: string; body: { reason: string; movementId: string }; movement: CustomerMovement }
  | { kind: 'status'; key: string; body: { status: CustomerStatus } };

