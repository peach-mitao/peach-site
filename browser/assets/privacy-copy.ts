export const privacyEnglish:Record<string,string>={
 'privacy-title':'Analytics preferences',
 'privacy-collection':'Both sites use Cloudflare Web Analytics for page views and first-party analytics for clicks, visible areas and anonymous journeys. A random session cookie shared across peach.video subdomains expires after 30 minutes of inactivity. Anonymous detailed events and their reference screenshots are retained long term. Aggregate analytics are retained for three months.',
 'privacy-scope':'First-party analytics do not collect input text, search terms, movie titles, full URLs, IP addresses or full user-agent strings. No session recordings are made. We cannot observe where you go after leaving; the exit location is the last position recorded before the session ends.',
};
export const privacyLabels=(english:boolean)=>({
 off:english?'Opt out of first-party analytics':'停用自有统计',
 on:english?'Allow first-party analytics':'允许自有统计',
 home:english?'Back to the website':'返回官网',
 demo:english?'Open the demo':'打开演示站',
});
export const privacyStatus=(english:boolean,off:boolean)=>english
 ?off?'First-party analytics are off':'First-party analytics are allowed'
 :off?'自有统计已停用':'自有统计已允许';
