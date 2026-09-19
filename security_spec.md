# Security Specification for Baselbot

## Data Invariants
1. **User Isolation**: A user can only read and write their own trading signals and bot state.
2. **Signal Integrity**: Signals must have a valid symbol, type (BUY/SELL), and a positive strength.
3. **State Consistency**: `isRunning` must be a boolean, and `lastHeartbeat` must be a valid server timestamp (or recently generated).
4. **ID Poisoning**: Document IDs must be valid alphanumeric strings.

## The "Dirty Dozen" Payloads (Designed to Fail)
1. **Identity Theft**: Attempt to write a signal to another user's path.
2. **Signal Spoofing**: Write a signal with strength > 1.0.
3. **State Corruption**: Write `isRunning` as a string instead of a boolean.
4. **Timestamp Manipulation**: Write a `lastHeartbeat` from the future.
5. **ID Poisoning**: Use a 2KB string as a `signalId`.
6. **Missing Required Fields**: Write a signal without a `symbol`.
7. **Invalid Enum**: Write a signal with type `HOLD`.
8. **Resource Exhaustion**: Write an `activeSymbols` array with 10,000 elements.
9. **PII Leakage**: Attempt to read the entire `/users` collection without specifying a `userId`.
10. **Unauthorized Update**: A non-owner attempting to update a bot's `isRunning` state.
11. **Negative Strength**: Write a signal with strength < 0.
12. **Future Signal**: Write a signal with a timestamp in the year 2099.

## Test Runner (firestore.rules.test.ts)
(Logic to be implemented in the next step to verify the rules deny these payloads)
