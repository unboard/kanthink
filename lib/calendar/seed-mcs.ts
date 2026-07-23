import { db } from '@/lib/db';
import { marketingIdeas, marketingAssets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { MarketingChannel, IdeaStatus, Effort, AssetKind } from './types';

export interface SeedIdea {
  title: string;
  date: string;               // YYYY-MM-DD
  channel: MarketingChannel;
  audience: string;
  objective: string;
  justification: string;
  metric: string;
  owner: string;
  collaborators?: string[];
  tools: string[];
  effort: Effort;
  status: IdeaStatus;
  notes: string;
}

/**
 * The MyCreativeShop 2026 marketing playbook.
 *
 * Every item answers the same five questions Dustin asked for: WHO (audience),
 * WHAT for (objective), WHY NOW (justification), WHO pulls the trigger (owner /
 * collaborators) and with WHAT (tools). Revenue is the north star — each item
 * names the metric it moves.
 *
 * Owners: Dustin (design + marketing lead), Jason (product / editor + designer),
 * Erica (automations + tooling).
 */
export const MCS_SEED: SeedIdea[] = [
  // ---------------- JANUARY — fresh start, tax + spring pre-season ----------------
  {
    title: 'New Year, New Marketing — /design generator relaunch email',
    date: '2026-01-06', channel: 'email', audience: 'All users + lapsed free accounts',
    objective: 'Re-engage the base and drive first design generations of the year',
    justification: 'January is the highest-intent planning month for small businesses. Lead with the lowest-friction "win" — 20 designs in 20 seconds.',
    metric: 'Design generations started · Pro upgrades', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Customer.io', 'React Email', '/design'], effort: 'M', status: 'done',
    notes: 'Show the brand-import → prompt → generate flow. CTA: "Plan your whole year of print in an afternoon." Segment: everyone, suppress last-30-day purchasers.',
  },
  {
    title: 'Refresh /for/real-estate-agents landing page for spring market',
    date: '2026-01-13', channel: 'seo', audience: 'Real estate agents',
    objective: 'Rank + convert agents planning spring farming (just listed/just sold, open house)',
    justification: 'Agents budget marketing in Jan–Feb before the spring selling season. Own the search now so we capture the whole season.',
    metric: 'Organic sessions to /for pages · print orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'SEO', '/design'], effort: 'M', status: 'done',
    notes: 'Frame the full agent kit: open house flyers, just-listed/just-sold postcards, neighborhood farming postcards, yard signs. One clear "generate yours" CTA per product.',
  },
  {
    title: 'EDDM neighborhood-farming walkthrough — real estate segment',
    date: '2026-01-20', channel: 'direct_mail', audience: 'Real estate agents',
    objective: 'Introduce Every Door Direct Mail as the agent farming engine',
    justification: 'Agents know farming works but think it is hard. Show the mapping tool selecting routes in a few clicks — that removes the objection.',
    metric: 'EDDM campaigns launched · print + mail revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', 'React Email'], effort: 'M', status: 'done',
    notes: 'Email + short screen recording of the EDDM route map. Position: "Pick the neighborhood, we handle the rest."',
  },
  {
    title: 'Blog: "12 postcard campaigns that fill your Q1 calendar"',
    date: '2026-01-27', channel: 'blog', audience: 'Home services, accountants, gyms',
    objective: 'Capture "postcard ideas" search intent and seed proactive campaign thinking',
    justification: 'People react instead of plan. A concrete idea list gets them to act before the season, not after.',
    metric: 'Organic sessions · assisted print orders', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Blog CMS', 'SEO', '/design'], effort: 'S', status: 'done',
    notes: 'Each idea links to the matching template + a "generate your own" CTA. Repurpose into a Customer.io drip.',
  },

  // ---------------- FEBRUARY — tax season peak, Valentine's, ads test ----------------
  {
    title: 'Tax-season kit email — accountants & tax preparers',
    date: '2026-02-03', channel: 'email', audience: 'Accountants, bookkeepers, tax preparers',
    objective: 'Sell the seasonal kit: flyers, door hangers, referral cards',
    justification: 'Tax pros have a hard deadline-driven season. Reaching them early Feb is exactly when they staff up and market.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', 'React Email', '/design'], effort: 'S', status: 'done',
    notes: 'Segment CIO by industry = accounting/finance. Refer-a-friend card is the hero — tax referrals are gold.',
  },
  {
    title: 'Google Ads test: "yard sign maker" + "real estate flyer template"',
    date: '2026-02-10', channel: 'ads', audience: 'High-intent searchers',
    objective: 'Prove paid search CAC on our two strongest product terms',
    justification: 'We have barely tested ads. A tight two-term test tells us if paid search can scale profitably before spring demand peaks.',
    metric: 'Signups + Pro conversions per $ · CAC', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Google Ads', '/design', '/for pages'], effort: 'M', status: 'done',
    notes: 'Land on the product /design flow, not the homepage. Erica wires conversion tracking to Pro upgrade + first order.',
  },
  {
    title: 'Brand Import reliability improvements',
    date: '2026-02-17', channel: 'product', audience: 'All new users',
    objective: 'Make logo / color / content extraction from a URL near-flawless',
    justification: 'Brand import is the magic first step of /design. Every failed import is a lost activation. Highest-leverage product fix before spring traffic.',
    metric: 'Brand-import success rate · activation → first generation', owner: 'Jason',
    tools: ['/design', 'Editor'], effort: 'L', status: 'done',
    notes: 'Prioritize logo isolation + color palette accuracy. Add graceful fallback when a site blocks scraping.',
  },
  {
    title: '"20 designs in 20 seconds" reels — /design generator',
    date: '2026-02-24', channel: 'social', audience: 'Small business owners, non-designers',
    objective: 'Show the frictionless generate loop as short-form video',
    justification: 'The wow of the generator is visual and fast — perfect for reels. Non-designers are our biggest unlock and they scroll.',
    metric: 'Video-driven signups · design generations', owner: 'Dustin',
    tools: ['/design', 'Social'], effort: 'M', status: 'done',
    notes: 'Screen-capture: brand import → prompt → 5 options appear → order. Keep under 15s. Reuse in ads.',
  },

  // ---------------- MARCH — spring kickoff, lawn care, roofing, automation ----------------
  {
    title: 'Spring cleanup email — lawn care & landscaping',
    date: '2026-03-03', channel: 'email', audience: 'Lawn care, landscaping',
    objective: 'Sell door hangers + yard signs to book the spring cleanup schedule',
    justification: 'Lawn crews fill their spring route in early March. Door hangers on the exact street they are already working is the highest-ROI local play.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', 'React Email', '/design'], effort: 'S', status: 'done',
    notes: 'Feature a "fall/spring cleanup special" promo template. Pair door hangers with lawn yard signs (leave-behind + advertising in one).',
  },
  {
    title: 'Publish /for/lawn-care-landscaping + spring promo blog',
    date: '2026-03-10', channel: 'seo', audience: 'Lawn care, landscaping',
    objective: 'Own seasonal search for lawn care marketing materials',
    justification: 'Search volume for "lawn care flyer / door hanger" spikes March–April. The industry page + blog capture and convert it.',
    metric: 'Organic sessions · print orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'Blog CMS', 'SEO'], effort: 'M', status: 'done',
    notes: 'Blog "10 lawn care promo ideas" links into the /for page. Add FAQ schema for AEO.',
  },
  {
    title: 'Roofing storm-season EDDM walkthrough',
    date: '2026-03-17', channel: 'direct_mail', audience: 'Roofers, exterior contractors',
    objective: 'Position EDDM + postcards for neighborhood storm response',
    justification: 'Roofers chase storms and neighborhoods. EDDM lets them blanket an affected area fast — show radius + route targeting.',
    metric: 'EDDM campaigns · mail + print revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'M', status: 'done',
    notes: 'Also push roofing yard signs + door hangers as the ground game companion to the mailer.',
  },
  {
    title: 'Build seasonal-trigger email pipeline in Customer.io',
    date: '2026-03-24', channel: 'automation', audience: 'Internal — marketing ops',
    objective: 'Auto-send the right industry+season email without hand-building each one',
    justification: 'We are manually assembling every seasonal send. A reusable pipeline (industry attribute × season → React Email template) lets us cover far more segments with less effort.',
    metric: 'Sends shipped per week · marketing hours saved', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Customer.io', 'React Email'], effort: 'L', status: 'done',
    notes: 'Map CIO industry attributes → template slugs. Dustin supplies the seasonal calendar; Erica automates the trigger + assembly.',
  },
  {
    title: 'Real estate spring farming — just listed / just sold postcards',
    date: '2026-03-31', channel: 'email', audience: 'Real estate agents',
    objective: 'Convert spring listings into recurring postcard buyers',
    justification: 'Peak listing season. Every new listing is a reason to farm the block with just-listed then just-sold cards.',
    metric: 'Repeat print orders per agent', owner: 'Dustin',
    tools: ['Customer.io', '/design', 'EDDM tool'], effort: 'S', status: 'done',
    notes: 'Frame it as a two-touch play (listed → sold). Bundle with a neighborhood intro postcard for the whole farm.',
  },

  // ---------------- APRIL — peak spring, home services, retention ----------------
  {
    title: 'Pressure washing & exterior cleaning spring push',
    date: '2026-04-07', channel: 'email', audience: 'Pressure washing, window/gutter cleaning',
    objective: 'Sell spring flyers + door hangers for exterior cleaning',
    justification: 'Warm weather = pressure washing demand. These small operators live and die on door hangers and yard signs.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'done',
    notes: 'Before/after imagery sells this service — lean the template gallery into that.',
  },
  {
    title: 'Blog: "The home-services marketing calendar — what to send each month"',
    date: '2026-04-14', channel: 'blog', audience: 'HVAC, roofing, lawn, plumbing, cleaning',
    objective: 'Rank for planning intent + drive proactive year-round ordering',
    justification: 'Home services is our deepest vertical. A month-by-month calendar makes us the planning authority and seeds repeat orders.',
    metric: 'Organic sessions · repeat orders', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Blog CMS', 'SEO', 'Customer.io'], effort: 'M', status: 'done',
    notes: 'Gate a printable calendar PDF for email capture. Erica turns it into an evergreen onboarding drip.',
  },
  {
    title: 'Retarget /design visitors who did not order → Pro upgrade',
    date: '2026-04-21', channel: 'ads', audience: 'Warm visitors who generated but did not convert',
    objective: 'Recover high-intent drop-off with a Pro / print reminder',
    justification: 'People generate a design, love it, then stall on the download paywall or checkout. Retargeting is the cheapest revenue we can buy.',
    metric: 'Pro upgrades · print orders from retargeting', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Google Ads', 'Customer.io'], effort: 'M', status: 'done',
    notes: 'Also mirror as a Customer.io "you left a design" email. Message: "Your design is ready — download or print it."',
  },
  {
    title: 'Editor: faster placeholder swap + in-editor AI image polish',
    date: '2026-04-28', channel: 'product', audience: 'Users customizing a generated design',
    objective: 'Reduce friction between "generated" and "ordered"',
    justification: 'The gap where revenue leaks is customization. Swapping placeholder photos and generating AI images inline must feel instant.',
    metric: 'Generate → order conversion', owner: 'Jason',
    tools: ['Editor', 'AI image'], effort: 'L', status: 'done',
    notes: 'One-click replace of placeholder images; keep AI image gen in-context so users never leave the canvas.',
  },

  // ---------------- MAY — events, graduation, HVAC ----------------
  {
    title: 'Graduation & party season — banners, yard signs, step-and-repeat',
    date: '2026-05-05', channel: 'email', audience: 'Parents, event hosts, party planners',
    objective: 'Sell celebration print for grad season',
    justification: 'Graduation parties are a predictable May–June spike. Step-and-repeat banners are a delightful, high-margin discovery for consumers.',
    metric: 'Consumer print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'done',
    notes: 'Show a grad party as a bundle: yard sign + banner + photo step-and-repeat. Great AI-generation demo too.',
  },
  {
    title: 'Publish /for/event-planners + "graduation printables" blog',
    date: '2026-05-12', channel: 'seo', audience: 'Event planners, party hosts',
    objective: 'Capture event + graduation print search',
    justification: 'Events are an underdeveloped vertical for us with strong seasonal search. A dedicated page + blog opens it up.',
    metric: 'Organic sessions · print orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'Blog CMS', 'SEO'], effort: 'M', status: 'done',
    notes: 'Cover the full event kit: banners, feather flags, tickets, wristbands, table tents, canopy tents.',
  },
  {
    title: 'HVAC summer tune-up EDDM + refer-a-friend cards',
    date: '2026-05-19', channel: 'direct_mail', audience: 'HVAC contractors',
    objective: 'Sell the summer tune-up mail campaign',
    justification: 'HVAC books summer tune-ups in May before the first heat wave. EDDM + a refer-a-friend incentive card is their proven combo.',
    metric: 'EDDM campaigns · mail revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'M', status: 'done',
    notes: 'Refer-a-friend template with a fill-in incentive. Pair with door hangers for tech leave-behinds.',
  },
  {
    title: 'Customer showcase — real local business who printed with MCS',
    date: '2026-05-26', channel: 'social', audience: 'Prospects, small business owners',
    objective: 'Social proof that real businesses ship real print with us',
    justification: 'Trust is the conversion blocker for print. Showing a real shop with real signage in the wild beats any feature claim.',
    metric: 'Engagement → signups', owner: 'Dustin',
    tools: ['Social', 'Blog CMS'], effort: 'S', status: 'done',
    notes: 'Interview a happy customer; capture their finished yard sign / banner in use. Reuse as a testimonial block on /for pages.',
  },

  // ---------------- JUNE — summer events, festivals, product + automation ----------------
  {
    title: 'Community festival & booth kit email',
    date: '2026-06-02', channel: 'email', audience: 'Vendors, small businesses doing summer events',
    objective: 'Sell the event-booth bundle: canopy tents, feather flags, banners, wristbands, tickets',
    justification: 'Summer festival season means every local vendor needs a booth setup. We have a Vistaprint-equivalent for each piece — bundle it.',
    metric: 'Multi-product orders · AOV', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'M', status: 'done',
    notes: 'Position as "everything to look legit at your next event." Great cross-sell / higher AOV opportunity.',
  },
  {
    title: 'Blog: "Everything you need to print for a summer event booth"',
    date: '2026-06-09', channel: 'blog', audience: 'Event vendors, festival participants',
    objective: 'Rank for event-booth intent and drive the bundle',
    justification: 'Complements the June email with evergreen search capture that pays off every summer.',
    metric: 'Organic sessions · bundle orders', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Blog CMS', 'SEO', '/design'], effort: 'S', status: 'done',
    notes: 'Checklist format with a product link + generate CTA per item.',
  },
  {
    title: '/design multi-option UX refinement (front/back option stacks)',
    date: '2026-06-16', channel: 'product', audience: 'All /design users',
    objective: 'Make "keep generating options" and per-side selection effortless',
    justification: 'The core magic is stacking options and mixing front/back. Any friction here dampens the wow that drives word of mouth and conversion.',
    metric: 'Options generated per session · order conversion', owner: 'Jason',
    tools: ['/design', 'Editor'], effort: 'L', status: 'done',
    notes: 'Clear "make another" affordance; previous options persist and are easy to revisit; independent front/back selection.',
  },
  {
    title: 'Auto-built weekly "industry spotlight" email',
    date: '2026-06-23', channel: 'automation', audience: 'Internal — content engine',
    objective: 'Ship a targeted industry email every week with near-zero manual work',
    justification: 'Consistency beats intensity. An engine that assembles a weekly spotlight (industry + relevant products + seasonal hook) keeps us always-on.',
    metric: 'Weekly send cadence held · segment engagement', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Customer.io', 'React Email'], effort: 'L', status: 'done',
    notes: 'Pulls product data + the seasonal calendar to auto-draft; Dustin approves in one click before send.',
  },
  {
    title: 'AEO test: FAQ schema on /for pages for AI answer citations',
    date: '2026-06-30', channel: 'seo', audience: 'AI chatbot / answer-engine users',
    objective: 'Get MCS cited by AI assistants for local print questions',
    justification: 'Discovery is shifting to AI answers. Structured, quotable FAQ content on /for pages positions us to be the cited source.',
    metric: 'AI referral sessions · /for impressions', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['/for pages', 'SEO'], effort: 'M', status: 'done',
    notes: 'Add crisp Q&A ("What size should a real estate yard sign be?") with schema. Measure referrals from AI sources.',
  },

  // ---------------- JULY — back-to-school prep, political warm-up, fall pre-book (NOW) ----------------
  {
    title: 'Back-to-school prep — tutors, daycares, sports leagues',
    date: '2026-07-07', channel: 'email', audience: 'Tutoring, childcare, youth sports',
    objective: 'Sell flyers, banners, and car magnets for enrollment season',
    justification: 'Enrollment and registration marketing happens in July before the school year. Early reach wins the season.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'done',
    notes: 'Car magnets + yard signs for coaches and tutors; enrollment flyers for daycares.',
  },
  {
    title: 'Publish /for/political-campaigns page for fall elections',
    date: '2026-07-14', channel: 'seo', audience: 'Local political candidates & campaign staff',
    objective: 'Own political print search ahead of the fall cycle',
    justification: 'Local candidates ramp fundraising and materials in mid-summer. Yard signs and door hangers are their #1 spend — be there first.',
    metric: 'Organic sessions · political print orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'SEO', '/design'], effort: 'M', status: 'done',
    notes: 'Full slate: yard signs, door hangers, palm cards, banners, step-and-repeat for events. Emphasize fast turnaround.',
  },
  {
    title: 'Lawn care FALL pre-booking EDDM (aeration / cleanup)',
    date: '2026-07-21', channel: 'direct_mail', audience: 'Lawn care, landscaping',
    objective: 'Get crews pre-booking fall aeration & cleanup routes now',
    justification: 'Smart lawn operators lock the fall route in mid-summer. Prompting the pre-book early captures the mailer order before competitors think of it.',
    metric: 'EDDM campaigns · mail revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'M', status: 'in_progress',
    notes: 'Reuse spring cleanup templates reskinned for fall. Lead the "plan ahead" angle — that is our whole calendar thesis.',
  },
  {
    title: '"Fall is coming — lock in your seasonal campaigns" home-services email',
    date: '2026-07-23', channel: 'email', audience: 'HVAC, roofing, lawn, cleaning',
    objective: 'Drive proactive planning of fall campaigns across home services',
    justification: 'This is the pivot week from summer to fall planning. One email nudging the whole home-services base to plan ahead seeds a quarter of orders.',
    metric: 'Segment engagement · Q4 print orders', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Customer.io', 'React Email', '/design'], effort: 'S', status: 'in_progress',
    notes: 'Tie to the fall calendar blog. CTA: "Generate your fall campaign in 20 seconds." Uses the seasonal-trigger pipeline.',
  },
  {
    title: 'Blog: "Political yard sign & door hanger playbook for local candidates"',
    date: '2026-07-28', channel: 'blog', audience: 'Local political candidates',
    objective: 'Rank for political print intent + support the /for page',
    justification: 'Backs the political /for page with how-to authority right as candidates start buying. Political is a high-volume, deadline-driven spike.',
    metric: 'Organic sessions · political orders', owner: 'Dustin',
    tools: ['Blog CMS', 'SEO', '/design'], effort: 'S', status: 'planned',
    notes: 'Cover sign sizing, placement rules, messaging, and turnaround. Link every product mention to a generate CTA.',
  },

  // ---------------- AUGUST — back-to-school peak, political ads, fall events ----------------
  {
    title: 'Back-to-school peak — schools, PTAs, sports & spirit',
    date: '2026-08-04', channel: 'email', audience: 'Schools, PTAs, booster clubs, sports',
    objective: 'Sell yard signs, banners, and spirit posters for the school year kickoff',
    justification: 'August is the school-marketing peak. Fundraisers, spirit, and registration all need print at once.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'planned',
    notes: 'Fundraiser yard signs, team banners, spirit posters, tickets for games. PTA fundraiser bundle.',
  },
  {
    title: 'Publish /for/schools-pta + fundraiser printables blog',
    date: '2026-08-11', channel: 'seo', audience: 'Schools, PTAs, fundraiser organizers',
    objective: 'Capture back-to-school + fundraiser search',
    justification: 'Recurring annual demand with dedicated organizers who buy in volume. A durable page compounds every August.',
    metric: 'Organic sessions · fundraiser orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'Blog CMS', 'SEO'], effort: 'M', status: 'planned',
    notes: 'Fundraiser kit: tickets, banners, yard signs, flyers, gift certificates for raffles.',
  },
  {
    title: 'Google Ads: political yard signs + campaign door hangers',
    date: '2026-08-18', channel: 'ads', audience: 'Candidates searching for signage',
    objective: 'Buy high-intent political demand at the ramp',
    justification: 'Political buyers are deadline-driven and price-insensitive relative to urgency — ideal paid-search economics during the fall cycle.',
    metric: 'Political orders per $ · ROAS', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Google Ads', '/for pages', '/design'], effort: 'M', status: 'planned',
    notes: 'Land on the political /for page. Erica tracks order value for ROAS. Emphasize turnaround time in ad copy.',
  },
  {
    title: 'Fall festival & pumpkin patch EDDM promo',
    date: '2026-08-25', channel: 'direct_mail', audience: 'Farms, festivals, seasonal attractions, churches',
    objective: 'Sell EDDM + posters/banners for fall attractions',
    justification: 'Fall festivals and pumpkin patches market in late August to drive September–October foot traffic. EDDM blankets the local area.',
    metric: 'EDDM campaigns · print revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'S', status: 'planned',
    notes: 'Banners, feather flags, posters, yard signs for the attraction; EDDM postcards to the surrounding routes.',
  },

  // ---------------- SEPTEMBER — fall home services, product checkout, political peak ----------------
  {
    title: 'Fall home services — HVAC heating, gutters, roofing',
    date: '2026-09-01', channel: 'email', audience: 'HVAC, roofing, gutter/exterior services',
    objective: 'Sell door hangers + postcards for fall service demand',
    justification: 'First cold snap drives heating tune-ups and gutter/roof prep. Early September reach books the fall route.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design', 'EDDM tool'], effort: 'S', status: 'planned',
    notes: 'Seasonal tune-up special templates; refer-a-friend cards; neighborhood door hangers.',
  },
  {
    title: 'Blog: "The fall marketing calendar for local businesses" (auto-built)',
    date: '2026-09-08', channel: 'blog', audience: 'All local business verticals',
    objective: 'Evergreen planning content that seeds Q4 orders',
    justification: 'Mirror of the spring/home-services calendar for fall. Proves the automation content engine and drives proactive ordering.',
    metric: 'Organic sessions · Q4 orders', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Blog CMS', 'React Email', 'SEO'], effort: 'M', status: 'planned',
    notes: 'Erica auto-drafts from product data + calendar; Dustin edits for voice. Repurpose to a Customer.io drip.',
  },
  {
    title: 'Editor + /design "order prints" checkout polish',
    date: '2026-09-15', channel: 'product', audience: 'Users ready to buy',
    objective: 'Lift print revenue by smoothing the path from design to order',
    justification: 'Print fulfillment is our own margin. Every friction point in "order prints" is direct lost revenue. Fix before Q4 volume.',
    metric: 'Design → order conversion · print revenue', owner: 'Jason',
    tools: ['Editor', '/design'], effort: 'L', status: 'planned',
    notes: 'Clarify quantity/size/turnaround selection; reduce steps to checkout; surface "order prints" prominently from the generator.',
  },
  {
    title: 'Halloween & fall event design showcase reels',
    date: '2026-09-22', channel: 'social', audience: 'Event hosts, restaurants, retailers',
    objective: 'Inspire seasonal design generation with short-form video',
    justification: 'Fall/Halloween designs are visually fun and shareable — ideal for reels that drive generator trials heading into Q4.',
    metric: 'Video-driven signups · generations', owner: 'Dustin',
    tools: ['Social', '/design'], effort: 'S', status: 'planned',
    notes: 'Generate a Halloween flyer + event banner on camera. CTA to /design with a seasonal prompt.',
  },
  {
    title: 'Political final push — candidates 5 weeks out',
    date: '2026-09-29', channel: 'email', audience: 'Local political candidates',
    objective: 'Capture the last big signage + mailer order before election',
    justification: 'Five weeks out is the final ordering window for yard signs, door hangers, and mailers. Turnaround urgency is the hook.',
    metric: 'Political orders · AOV', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'S', status: 'planned',
    notes: 'Stress fast turnaround. Bundle yard signs + door hangers + an EDDM mailer for the final GOTV week.',
  },

  // ---------------- OCTOBER — holiday retail/restaurant prep, Pro conversion ----------------
  {
    title: 'Holiday prep — restaurants & retail',
    date: '2026-10-06', channel: 'email', audience: 'Restaurants, cafes, retail shops',
    objective: 'Sell menus, gift certificates, loyalty cards, table tents',
    justification: 'Restaurants and retailers lock holiday marketing in early October. Gift certificates + loyalty cards drive their Q4 revenue and ours.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'planned',
    notes: 'Holiday menu refresh, gift certificate templates, loyalty cards, table tents for seasonal promos.',
  },
  {
    title: 'Publish /for/restaurants + holiday restaurant marketing blog',
    date: '2026-10-13', channel: 'seo', audience: 'Restaurants, food service',
    objective: 'Capture restaurant marketing search + drive the holiday kit',
    justification: 'Restaurants are a broad, underdeveloped vertical with steady demand for menus and promo print. A dedicated page opens recurring orders.',
    metric: 'Organic sessions · restaurant orders', owner: 'Dustin', collaborators: ['Jason'],
    tools: ['/for pages', 'Blog CMS', 'SEO'], effort: 'M', status: 'planned',
    notes: 'Menus, table tents, gift certificates, loyalty cards, window posters, door hangers for delivery zones.',
  },
  {
    title: 'Holiday retail EDDM + grand-opening/seasonal-store promos',
    date: '2026-10-20', channel: 'direct_mail', audience: 'Retailers, seasonal & pop-up stores',
    objective: 'Sell EDDM + grand-opening print for holiday retail',
    justification: 'Holiday pop-ups and seasonal stores open in late October and need to announce themselves fast. Grand-opening banners + EDDM are the play.',
    metric: 'EDDM campaigns · print revenue', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'S', status: 'planned',
    notes: 'Grand-opening banners, flyers, step-and-repeat, EDDM to the trade area.',
  },
  {
    title: 'Pro / Unlimited holiday conversion push',
    date: '2026-10-27', channel: 'ads', audience: 'Active free users near their limits',
    objective: 'Convert engaged free users to Pro before the Q4 design surge',
    justification: 'Q4 is when free users hit generation/download limits most. A well-timed Pro offer converts intent that already exists.',
    metric: 'Pro / Unlimited upgrades · MRR', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Google Ads', 'Customer.io'], effort: 'M', status: 'planned',
    notes: 'Trigger on limit-approaching + retarget. Message the value: unlimited downloads + creative credits for the busy season.',
  },

  // ---------------- NOVEMBER — Small Business Saturday, BFCM Pro sale ----------------
  {
    title: 'Small Business Saturday kit',
    date: '2026-11-03', channel: 'email', audience: 'All local retailers & service businesses',
    objective: 'Sell posters, flyers, social graphics, loyalty cards for SBS',
    justification: 'Small Business Saturday (late Nov) is tailor-made for our audience. A ready-to-print kit makes us the obvious partner.',
    metric: 'Segment → print orders · goodwill', owner: 'Dustin',
    tools: ['Customer.io', '/design', 'Social'], effort: 'S', status: 'idea',
    notes: 'Free downloadable SBS social pack as a lead magnet; upsell printed posters + loyalty cards.',
  },
  {
    title: 'Black Friday — build in-app MCS Pro upgrade offer',
    date: '2026-11-10', channel: 'product', audience: 'Free + lapsed users',
    objective: 'Ship the BFCM Pro promo mechanics in-app',
    justification: 'The single biggest self-serve MRR moment of the year. The in-app offer + banner must be built and tested before the traffic hits.',
    metric: 'Pro upgrades · MRR', owner: 'Jason', collaborators: ['Erica'],
    tools: ['Editor', '/design'], effort: 'M', status: 'planned',
    notes: 'Countdown banner, discounted annual Pro, one-click upgrade. Erica wires the eligibility + tracking.',
  },
  {
    title: 'MCS Black Friday / Cyber Monday Pro sale',
    date: '2026-11-17', channel: 'email', audience: 'All users',
    objective: 'Drive the year\'s biggest Pro / Unlimited conversion moment',
    justification: 'Everyone expects a BFCM deal. Our own subscription sale is pure margin and compounds into recurring revenue.',
    metric: 'Pro / Unlimited upgrades · MRR', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Customer.io', 'React Email', 'Google Ads'], effort: 'M', status: 'planned',
    notes: 'Multi-touch: tease → open → last-chance. Pair email with retargeting ads. Uses the in-app offer Jason built.',
  },
  {
    title: 'Blog: "Holiday marketing checklist for local businesses"',
    date: '2026-11-24', channel: 'blog', audience: 'All local business verticals',
    objective: 'Capture holiday planning search + drive seasonal print',
    justification: 'High-intent seasonal search with a clear checklist that converts to orders across many verticals.',
    metric: 'Organic sessions · seasonal orders', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Blog CMS', 'SEO', '/design'], effort: 'S', status: 'planned',
    notes: 'Downloadable checklist for email capture; each item links to a product + generate CTA.',
  },

  // ---------------- DECEMBER — year-end, nonprofits, 2027 planning ----------------
  {
    title: 'Year-end nonprofits & churches',
    date: '2026-12-01', channel: 'email', audience: 'Nonprofits, churches, community orgs',
    objective: 'Sell event flyers, giving cards, and banners for year-end campaigns',
    justification: 'Year-end giving season means events and appeals. These orgs need flyers, banners, and giving/pledge cards in early December.',
    metric: 'Segment → print orders', owner: 'Dustin',
    tools: ['Customer.io', '/design'], effort: 'S', status: 'idea',
    notes: 'Giving campaign cards, event banners, service flyers. Sensitive, warm tone.',
  },
  {
    title: '"New Year, new customers" — January EDDM pre-book',
    date: '2026-12-08', channel: 'direct_mail', audience: 'Home services, real estate, fitness',
    objective: 'Pre-sell January EDDM campaigns before the holidays',
    justification: 'Locking the January mailer in December means we own the new-year rush. Fitness and home services especially plan a January blitz.',
    metric: 'EDDM campaigns booked for January', owner: 'Dustin',
    tools: ['Customer.io', 'EDDM tool', '/design'], effort: 'S', status: 'planned',
    notes: 'Our calendar thesis in action — sell the plan-ahead. Reuse January templates reskinned.',
  },
  {
    title: 'Year-in-review: best customer designs of 2026',
    date: '2026-12-15', channel: 'social', audience: 'Prospects + existing customers',
    objective: 'Social proof + inspiration to close the year strong',
    justification: 'A best-of showcase celebrates customers, provides social proof, and inspires new design generations heading into the new year.',
    metric: 'Engagement → signups · generations', owner: 'Dustin',
    tools: ['Social', 'Blog CMS'], effort: 'S', status: 'idea',
    notes: 'Curate standout real designs across verticals. Reuse as testimonial + gallery content on /for pages.',
  },
  {
    title: 'Auto-populate the 2027 seasonal calendar from this year\'s playbook',
    date: '2026-12-22', channel: 'automation', audience: 'Internal — marketing ops',
    objective: 'Roll the proven 2026 calendar forward into 2027 automatically',
    justification: 'The playbook we ran this year is the template for next year. Automating the roll-forward saves a full planning cycle and keeps us always-on.',
    metric: 'Planning hours saved · calendar coverage', owner: 'Erica', collaborators: ['Dustin'],
    tools: ['Customer.io', 'React Email'], effort: 'M', status: 'idea',
    notes: 'Shift dates +1 year, keep the seasonal logic, flag winners to double down on and losers to drop.',
  },
  {
    title: 'New Year kickoff tease — plan Q1 with /design',
    date: '2026-12-29', channel: 'email', audience: 'All users',
    objective: 'Prime the base to plan Q1 print in the first days of January',
    justification: 'The last send of the year sets up the first campaign of the next. Get users thinking about their Q1 plan before competitors do.',
    metric: 'January engagement · design generations', owner: 'Dustin', collaborators: ['Erica'],
    tools: ['Customer.io', 'React Email', '/design'], effort: 'S', status: 'idea',
    notes: 'Warm, forward-looking. CTA: "Generate your January campaign now." Hands off to the January relaunch send.',
  },
];

// ---- Knowledge base seed: who we sell to, what we sell, where we send them ----
export interface SeedAsset {
  kind: AssetKind;
  name: string;
  description: string;
  url?: string;
  tags?: string[];
}

export const MCS_ASSETS: SeedAsset[] = [
  // Audiences (industries / topics)
  { kind: 'audience', name: 'Real estate agents', description: 'Agents farming neighborhoods with just-listed/just-sold & open-house materials.', tags: ['spring', 'postcards', 'eddm'] },
  { kind: 'audience', name: 'Roofers', description: 'Storm-response & neighborhood roofing contractors.', tags: ['spring', 'summer', 'eddm', 'yard-signs'] },
  { kind: 'audience', name: 'Lawn care & landscaping', description: 'Crews booking spring & fall cleanup and recurring service routes.', tags: ['spring', 'fall', 'door-hangers'] },
  { kind: 'audience', name: 'HVAC contractors', description: 'Heating & cooling tune-ups; refer-a-friend programs.', tags: ['summer', 'fall', 'winter', 'eddm'] },
  { kind: 'audience', name: 'Pressure washing', description: 'Exterior cleaning operators; before/after visual selling.', tags: ['spring', 'summer', 'door-hangers'] },
  { kind: 'audience', name: 'Plumbers', description: 'Emergency + scheduled residential plumbing services.', tags: ['year-round', 'magnets'] },
  { kind: 'audience', name: 'Restaurants & cafes', description: 'Menus, table tents, gift certificates, loyalty cards, promos.', tags: ['holiday', 'menus'] },
  { kind: 'audience', name: 'Retail & shops', description: 'Local retailers; grand openings, sales, Small Business Saturday.', tags: ['holiday', 'grand-opening'] },
  { kind: 'audience', name: 'Event planners', description: 'Weddings, festivals, community events; full booth + signage kits.', tags: ['summer', 'events'] },
  { kind: 'audience', name: 'Schools & PTAs', description: 'Fundraisers, sports/spirit, registration & enrollment.', tags: ['back-to-school', 'fundraiser'] },
  { kind: 'audience', name: 'Political candidates', description: 'Local campaigns; yard signs, door hangers, palm cards, mailers.', tags: ['fall', 'election', 'yard-signs'] },
  { kind: 'audience', name: 'Nonprofits & churches', description: 'Events, year-end giving campaigns, community outreach.', tags: ['december', 'events'] },
  { kind: 'audience', name: 'Accountants & tax preparers', description: 'Tax-season flyers, door hangers, referral cards.', tags: ['tax-season', 'referral'] },
  { kind: 'audience', name: 'Fitness & gyms', description: 'New-year & seasonal membership drives.', tags: ['january', 'promo'] },
  { kind: 'audience', name: 'Childcare & tutoring', description: 'Daycares, tutors, youth programs; enrollment marketing.', tags: ['back-to-school'] },

  // Products (things they can print / we can sell)
  { kind: 'product', name: 'Yard signs', description: 'Corrugated + wire stake yard signs. Roofing, real estate, political, events.', url: 'https://www.mycreativeshop.com/yardsigns', tags: ['signs'] },
  { kind: 'product', name: 'Door hangers', description: 'Leave-behind door hangers for home-services canvassing.', url: 'https://www.mycreativeshop.com/doorhangers', tags: ['home-services'] },
  { kind: 'product', name: 'Postcards', description: 'Marketing postcards; just-listed/just-sold, promos, EDDM.', url: 'https://www.mycreativeshop.com/postcards', tags: ['direct-mail'] },
  { kind: 'product', name: 'Banners', description: 'Vinyl banners incl. step-and-repeat & feather flags for events.', url: 'https://www.mycreativeshop.com/banners', tags: ['events'] },
  { kind: 'product', name: 'Flyers', description: 'Full-color flyers for promos, events, services.', url: 'https://www.mycreativeshop.com/flyers', tags: ['general'] },
  { kind: 'product', name: 'Car magnets', description: 'Vehicle magnets — mobile advertising for tradespeople.', url: 'https://www.mycreativeshop.com/magnets', tags: ['home-services'] },
  { kind: 'product', name: 'Business cards', description: 'Standard + specialty business cards.', url: 'https://www.mycreativeshop.com/business-cards', tags: ['general'] },
  { kind: 'product', name: 'Menus & table tents', description: 'Restaurant menus and table tents for promos.', url: 'https://www.mycreativeshop.com/menus', tags: ['restaurants'] },
  { kind: 'product', name: 'Gift certificates & loyalty cards', description: 'Retail/restaurant retention & holiday revenue drivers.', tags: ['holiday', 'retail'] },
  { kind: 'product', name: 'Event kit (tents, flags, wristbands, tickets)', description: 'Canopy tents, feather flags, wristbands, tickets, step-and-repeat.', tags: ['events'] },

  // Pages (where we send people)
  { kind: 'page', name: '/design — AI text-to-design generator', description: 'Pick a product, connect brand via URL, prompt → finished design in <20s. The core wow.', url: 'https://www.mycreativeshop.com/design', tags: ['ai', 'conversion'] },
  { kind: 'page', name: '/for industry pages', description: 'One landing page per industry showing every relevant product. SEO/AEO + conversion.', url: 'https://www.mycreativeshop.com/for', tags: ['seo', 'landing'] },
  { kind: 'page', name: 'Online editor', description: 'Full editor with in-canvas AI image + AI writing assistants.', tags: ['editor', 'ai'] },
  { kind: 'page', name: 'Blog', description: 'Content marketing — seasonal how-tos and idea lists.', url: 'https://www.mycreativeshop.com/blog', tags: ['seo', 'content'] },
  { kind: 'page', name: 'EDDM / Direct Mail', description: 'EDDM route-map, list upload, and targeted radius+demographic campaigns.', tags: ['direct-mail'] },

  // Tools (marketing stack)
  { kind: 'tool', name: 'Customer.io', description: 'Event- & property-based segmentation. Message by industry attribute (all roofers, all agents, etc.).', tags: ['email', 'segmentation'] },
  { kind: 'tool', name: 'React Email builder', description: 'Assemble on-brand emails fast/programmatically for CIO sends.', tags: ['email'] },
  { kind: 'tool', name: 'Google Ads', description: 'Paid search tests on high-intent product terms; retargeting.', tags: ['ads'] },
  { kind: 'tool', name: 'AI image + writing assistants', description: 'In-editor AI image generation and copywriting.', tags: ['ai', 'content'] },
  { kind: 'tool', name: 'Upload-to-print AI detection', description: 'Matches an uploaded file to a printable product automatically.', tags: ['print'] },

  // Offers (conversion goals)
  { kind: 'offer', name: 'Pro plan', description: 'Unlocks downloads + AI creative credits. Primary MRR driver.', tags: ['subscription'] },
  { kind: 'offer', name: 'Unlimited plan', description: 'Full unlimited access tier.', tags: ['subscription'] },
  { kind: 'offer', name: 'Print orders', description: 'MCS-fulfilled print + ship. Direct margin.', tags: ['revenue'] },
];

/**
 * Insert the MCS knowledge base if none exists. Idempotent.
 */
export async function seedMcsAssets(business: string): Promise<number> {
  if (business !== 'mycreativeshop') return 0;

  const existing = await db
    .select({ id: marketingAssets.id })
    .from(marketingAssets)
    .where(eq(marketingAssets.business, business))
    .limit(1);
  if (existing.length > 0) return 0;

  const now = new Date();
  const rows = MCS_ASSETS.map((a, i) => ({
    business,
    kind: a.kind,
    name: a.name,
    description: a.description,
    url: a.url || '',
    tags: a.tags || [],
    notes: '',
    position: i,
    createdAt: now,
    updatedAt: now,
  }));
  for (let i = 0; i < rows.length; i += 25) {
    await db.insert(marketingAssets).values(rows.slice(i, i + 25));
  }
  return rows.length;
}

/**
 * Insert the MCS playbook for a business if it has no ideas yet. Idempotent.
 * Returns the number of ideas inserted (0 if already seeded).
 */
export async function seedMcsCalendar(business: string): Promise<number> {
  if (business !== 'mycreativeshop') return 0;

  const existing = await db
    .select({ id: marketingIdeas.id })
    .from(marketingIdeas)
    .where(eq(marketingIdeas.business, business))
    .limit(1);

  if (existing.length > 0) return 0;

  const now = new Date();
  const rows = MCS_SEED.map((s, i) => ({
    business,
    title: s.title,
    date: s.date,
    channel: s.channel,
    audience: s.audience,
    objective: s.objective,
    justification: s.justification,
    metric: s.metric,
    owner: s.owner,
    collaborators: s.collaborators || [],
    tools: s.tools,
    effort: s.effort,
    status: s.status,
    notes: s.notes,
    position: i,
    createdAt: now,
    updatedAt: now,
  }));

  // Insert in chunks to stay well under any statement limits.
  for (let i = 0; i < rows.length; i += 25) {
    await db.insert(marketingIdeas).values(rows.slice(i, i + 25));
  }

  return rows.length;
}
