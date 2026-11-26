// Print an invite link: node dist/scripts/invite.js friend@example.com [days]
import { createInvite } from '../lib/invite';

const [email, days] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('usage: node dist/scripts/invite.js <email> [days=7]');
  process.exit(1);
}
const appUrl = process.env.APP_URL || 'https://hadikhanhk786.github.io/citewise';
const token = createInvite(email, days ? Number(days) : 7);
console.log(`${appUrl}/register?email=${encodeURIComponent(email.trim().toLowerCase())}&invite=${token}`);
