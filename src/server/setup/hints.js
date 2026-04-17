const PATTERNS = [
  {
    regex: /INVALID_TYPE.*ConversationVendorInfo/,
    hint: 'Partner Telephony ライセンス未有効の可能性。Setup → Feature Settings → Service → Partner Telephony で有効化してください',
  },
  {
    regex: /DUPLICATE_DEVELOPER_NAME/,
    hint: '同名の Contact Center が既に存在します。ウィザードで [名前変更] または [上書き] を選択してください',
  },
  {
    regex: /Permission set .* does not exist/,
    hint: 'Partner Telephony Permission Set が未有効化です。Feature Settings を確認してください',
  },
  {
    regex: /You do not have access/i,
    hint: 'ログインユーザーに権限不足です。System Administrator プロファイルで再ログインしてください',
  },
  {
    regex: /No authorization information found/,
    hint: '認証切れです。`sf org login web --alias <alias>` で再ログインしてください',
  },
  {
    regex: /request to .* failed/,
    hint: 'Salesforce への接続失敗。ネットワークまたは `sf org display` で認証期限を確認してください',
  },
  {
    regex: /MalformedQueryException/,
    hint: '`sf` CLI バージョン不一致の可能性。`sf update` で更新してください',
  },
];

export function matchHint(text) {
  if (!text) return null;
  for (const { regex, hint } of PATTERNS) {
    if (regex.test(text)) return hint;
  }
  return null;
}

export const HINT_PATTERNS = PATTERNS;
