# Onboarding Tutorial Spec

## Overview
We want to introduce an onboarding tutorial for improved user retention. Users often try to claim vouchers immediately without understanding the system, leading to wasted credits or confusion.

This tutorial will guide new users through the process of:
1.  Responding to the bot.
2.  Understanding how to request a voucher (using a "safe" tutorial mode).
3.  Understanding how to report issues.
4.  Learning how to upload vouchers.

## User Flow

### 1. Trigger
The tutorial starts immediately after the existing "Welcome" and "Beta" messages are sent to a **new user**.

### 2. Tutorial Step 1: Requesting a Voucher
- **Bot Message**: "Let's show you how to use the bot. Send the number 10 to get a voucher."
- **User Action**:
    - If user sends "10": Proceed to Step 3.
    - If user sends anything else: **Bot Reply**: "Please send the number 10 to continue the tutorial." (Keeps user in this state).

### 3. Tutorial Step 2: Receiving a Sample
- **Bot Action**: Send a **sample voucher image** (e.g., a dummy graphic saying "Sample Voucher").
- **Bot Caption**:
    > "Here is your sample voucher!
    >
    > If this voucher does not work, you can hit 'Its not working' below."
- **Button**: Inline keyboard button labeled "⚠️ Its not working".

### 4. Tutorial Step 3: Reporting (Simulated)
- **User Action**: User clicks "⚠️ Its not working".
- **Bot Action**: Respond with a specialized tutorial message.
    - **Message**: "In the real system, this would report the voucher and refund your coins. For this tutorial, we're just practicing!"

### 5. Tutorial Step 4: Completion
- **Bot Message**:
    > "Please do not use vouchers you have uploaded yourself. Request a voucher through the bot instead.
    >
    > You are now ready to go!
    > • When you need a voucher, request one by sending **5**, **10**, or **20**.
    > • Upload a screenshot or photo of a voucher to earn coins."

## Technical Requirements

### Schema Changes
- Update `users` table `telegramState` to support `onboarding_voucher_request`.

### Logic
- **State Machine**: New users enter `onboarding_voucher_request` state upon creation.
- **Input Handling**:
    - Intercept all messages for users in `onboarding_voucher_request`.
    - Regex match for "10".
- **Assets**: Need a placeholder image for the sample voucher.
