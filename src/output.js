export function printSummary(chatName, scopeDesc, summary) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary of "${chatName}" (${scopeDesc}):`);
  console.log('='.repeat(60));
  console.log();
  console.log(summary);
  console.log();
  console.log('='.repeat(60));
}

export async function copyToClipboard(text) {
  try {
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(text);
    console.log('Copied to clipboard.');
  } catch {
    console.warn('Could not copy to clipboard (unavailable in this environment).');
  }
}
