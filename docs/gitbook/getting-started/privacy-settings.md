# Privacy Settings

## Overview

Hydentity lets you customize how your withdrawals are processed. These settings control the randomization applied to make transaction analysis harder.

---

## Privacy Presets

Choose from three preset configurations:

### Low Privacy
```
Splits: 1-3 transactions
Delays: 1-10 minutes between splits
```
**Best for:** Quick access when basic privacy is sufficient.

### Medium Privacy (Default)
```
Splits: 2-5 transactions
Delays: 5-30 minutes between splits
```
**Best for:** Balanced privacy and convenience.

### High Privacy
```
Splits: 3-5 transactions
Delays: 2-8 hours between splits
```
**Best for:** Maximum privacy when you can wait.

---

## Custom Settings

### Transaction Splits

Instead of withdrawing in one transaction, split into multiple smaller ones.

| Setting | Range | Description |
|---------|-------|-------------|
| Min Splits | 1-10 | Minimum number of transactions |
| Max Splits | 1-10 | Maximum number of transactions |

**Example:**
If withdrawing 10 SOL with splits 2-5, you might get:
```
Transaction 1:  3.2 SOL
Transaction 2:  2.8 SOL
Transaction 3:  2.1 SOL
Transaction 4:  1.9 SOL
```

### Timing Delays

Add random delays between split transactions.

| Setting | Range | Description |
|---------|-------|-------------|
| Min Delay | 60 seconds - 7 days | Minimum delay between splits |
| Max Delay | 60 seconds - 7 days | Maximum delay between splits |

**Example:**
With delays 5-30 minutes:
```
Split 1: Immediate
Split 2: +12 minutes
Split 3: +27 minutes
Split 4: +8 minutes
```

### Distribution Patterns

Control how amounts are distributed across splits.

| Pattern | Description |
|---------|-------------|
| **Uniform** | Equal amounts in each split |
| **Weighted** | Larger amounts first, smaller later |
| **Exponential Decay** | Significantly larger amounts early |

---

## Destination Modes

Control how destinations are selected when you have multiple withdrawal wallets.

| Mode | Description |
|------|-------------|
| **Single** | Always use the primary destination |
| **Rotating** | Cycle through destinations in order |
| **Random** | Randomly select for each split |

**Example with 3 destinations (Random mode):**
```
Split 1 → Destination 2
Split 2 → Destination 1
Split 3 → Destination 3
Split 4 → Destination 1
```

---

## Managing Destinations

### Adding Destinations

1. Go to Settings
2. Click "Add Destination"
3. Enter wallet address
4. Save changes

**Maximum:** 5 destination wallets

### Removing Destinations

1. Go to Settings
2. Find the destination to remove
3. Click the remove button
4. Save changes

**Note:** You must keep at least one destination.

---

## Updating Settings

### Through the UI

1. Go to your vault's Settings page
2. Modify privacy settings
3. Click "Update Policy"
4. Approve the transaction

### Settings Stored On-Chain

Your privacy policy is stored on-chain and includes:
- Split range (min/max)
- Delay range (min/max)
- Distribution pattern
- Destination mode
- Whether policy is enabled

### Encrypted Settings (via MPC)

Your destination addresses are stored encrypted via Arcium MPC:
- Never visible on-chain in plaintext
- Updated through MPC computation
- Only MPC cluster can access

---

## Privacy Mode

Control overall privacy behavior:

| Mode | Description |
|------|-------------|
| **Full Privacy** | All withdrawals use privacy features |
| **Partial Privacy** | Some withdrawals use privacy features |
| **Direct** | Bypass all privacy features |

---

## Recommendations

### For Maximum Privacy

```
Splits: 4-5
Delays: 4-8 hours
Distribution: Exponential Decay
Destination Mode: Random
Multiple Destinations: Yes (3-5)
```

### For Balanced Use

```
Splits: 2-4
Delays: 10-30 minutes
Distribution: Uniform
Destination Mode: Single
Multiple Destinations: Optional
```

### For Speed Priority

```
Splits: 1-2
Delays: 1-5 minutes
Distribution: Uniform
Destination Mode: Single
```

---

## Important Notes

1. **Settings apply to future withdrawals** - Changing settings doesn't affect in-progress withdrawals

2. **Privacy Cash is separate** - These settings control MPC-based splits. Privacy Cash mixing happens after.

3. **Higher privacy = longer waits** - More splits and longer delays mean slower access to funds

4. **Destinations are encrypted** - Your wallet addresses are never exposed on-chain
