/**
 * Type declarations for the privacycash SDK
 *
 * This is an optional dependency - if not installed, the Privacy Cash
 * features will gracefully degrade and be disabled.
 */

declare module 'privacycash' {
  export interface PrivacyCashConfig {
    RPC_url: string;
    owner: Uint8Array;
  }

  export interface DepositParams {
    lamports: number;
  }

  export interface DepositResult {
    tx: string;
  }

  export interface WithdrawParams {
    lamports: number;
    recipientAddress?: string;
  }

  export interface WithdrawResult {
    tx: string;
    amount_in_lamports: number;
    fee_in_lamports: number;
  }

  export interface BalanceResult {
    lamports: number;
  }

  export class PrivacyCash {
    constructor(config: PrivacyCashConfig);

    deposit(params: DepositParams): Promise<DepositResult>;
    withdraw(params: WithdrawParams): Promise<WithdrawResult>;
    getPrivateBalance(): Promise<BalanceResult>;
    clearCache(): Promise<void>;
  }
}
