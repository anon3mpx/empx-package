# Security

Report SDK security issues privately to the EmpX maintainers.

The SDK builds calldata and optional transaction execution helpers around deployed router contracts. Integrators should validate chain IDs, spender addresses, approval amounts, quote expiry, and wallet capabilities before sending transactions.

For automated wallets and agents, prefer exact approvals, short-lived quotes, and explicit signer authority. Use `prepareSwap()` for calldata-only flows and reserve `executeSwap()` for contexts where the signer is intentionally allowed to broadcast transactions.
