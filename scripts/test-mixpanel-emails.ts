import { queryForChat } from '../lib/ai/mixpanelDirect';

async function main() {
  console.log('Testing email query...');
  const result = await queryForChat('show me the emails for users that ordered prints');
  console.log(result.slice(0, 1500));
}

main().catch(console.error).finally(() => process.exit(0));
