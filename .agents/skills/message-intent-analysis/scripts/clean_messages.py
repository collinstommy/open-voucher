"""
Clean unknown inbound messages by removing junk/noise patterns.

Usage:
    python3 clean_messages.py <input.json> <output.json>
"""

import json, re, sys

# Patterns that match invite-code spam
INVITE_CODE_PATTERNS = [
    r'\bcode\b',       # "code reddit", "code alpha", "code YOUR_INVITE_CODE"
    r'\breddit\b',
    r'\bredditt\b',
    r'\balpha\b',
    r'YOUR_INVITE_CODE_HERE',
]

# Messages starting with digits (e.g., voucher codes, phone numbers)
DIGIT_START = re.compile(r'^\d')

# Single-word button/command taps (redundant with command list but catches typos)
BALANCE_COMMANDS = {
    'send balance', 'check balance', 'send balanxe', 'send help', 'get help',
    'check/balance', 'checkbalance',
}

SINGLE_WORD_COMMANDS = {
    'availability', 'available', 'upload', 'refer', 'referral', 'return',
    'support', 'menu', 'history', 'status', 'commands', 'info', 'help',
    'expiry', 'new', 'values', 'cancel', 'pool', 'voucher', 'coin', 'invite',
    'availablity', 'balamce', 'commands', 'invitation link',
    'coin values', 'voucher availability', 'contact support', 'cancel replacement',
    'top up', 'voucher please 10', 'share a voucher', 'claim a voucher',
    'return voucher', 'return a voucher', 'need voucher', 'voucher - 10',
    'how to return a voucher?', 'how many coins', 'which voucher?',
    'send balance', 'check balance', 'send balanxe',
}

SHORT_NOISE = {
    'hi', 'hello', 'he\'ll', 'test', 'testing', 'ok', 'okay',
    'no', 'yes', 'why?', '??', '?', 'd', 'ap', 'no probs',
    'thanks', 'thank you', 'thank you 👍', 'thanks!',
    'no good', 'not cool', 'fair', 'mega', 'worked',
    'it worked', 'this one worker', 'already done',
    'that\'s not possible', 'maybe...', 'i am not sure',
    'i don\'t think so', 'i already did', 'not sure',
    'already uploaded', 'it\'s too late', 'error',
    '❓', '🔟', '👍',
    'great thank you', 'great thanks and apologies for any hassle 👍',
    'perfect - thanks', 'great. looking forward to getting started',
    'sorry didn\'t mean to send', 'say thanks to your creator for me please bot',
    'he\'ll', 'he’ll',
}

EXTRA_JUNK = {
    'your_invite_code_here', 'support your_message',
    'need one for today\'s date', 'it\'s in date', 'spend coins',
    'expired', 'bal', '+15', 'the honey bus',
    'fochl😍💸', 'motor tax paid', 'the future is analog',
    'send balance', 'check balance', 'send balanxe',
}


def should_remove(text):
    if text is None:
        return True
    t = text.strip().lower()
    if not t:
        return True

    # Slash/backslash commands
    if re.match(r'^[/\\!]', t):
        return True

    # Invite code patterns (case-insensitive)
    for pat in INVITE_CODE_PATTERNS:
        if re.search(pat, t):
            return True

    # Starts with digit
    if DIGIT_START.match(t):
        return True

    # Exact match junk
    if t in BALANCE_COMMANDS or t in SINGLE_WORD_COMMANDS or t in SHORT_NOISE or t in EXTRA_JUNK:
        return True

    # WhatsApp auto-text
    if 'sent from' in t and 'whatsapp' in t:
        return True

    return False


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.json> <output.json>")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    messages = data.get('messages', data.get('Messages', []))
    cleaned = [m for m in messages if not should_remove(m.get('text'))]

    print(f"Input: {len(messages)} messages")
    print(f"Removed: {len(messages) - len(cleaned)}")
    print(f"Remaining: {len(cleaned)}")

    with open(sys.argv[2], 'w') as f:
        json.dump({"messages": cleaned}, f, indent=2, ensure_ascii=False)

    print(f"Saved to {sys.argv[2]}")


if __name__ == '__main__':
    main()
