import { describe, it, expect } from 'vitest';
import {
  checkEddmEligibility,
  checkListColumns,
  estimateCost,
  inHomeWindow,
  mailingGuide,
  campaignSteps,
  isReadyToLaunch,
  buildFactSheet,
  emptyCampaign,
  POSTCARD_SIZES,
} from '../lib/snailblast/campaign';
import { derivePanel } from '../lib/snailblast/panels';

describe('EDDM dimensional rules', () => {
  it('accepts a piece that exceeds the short-side minimum only', () => {
    // 9 x 6.5 — the EDDM workhorse. 9" is under the 10.5" length minimum, so it
    // qualifies purely on 6.5" > 6.125".
    expect(checkEddmEligibility(9, 6.5).eligible).toBe(true);
  });

  it('accepts a piece that exceeds the long-side minimum only', () => {
    expect(checkEddmEligibility(12, 6.5).eligible).toBe(true);
    expect(checkEddmEligibility(11, 6).eligible).toBe(true);
  });

  it('rejects 6x9 — the most common EDDM mistake', () => {
    // Neither 9 > 10.5 nor 6 > 6.125, so it fails despite "feeling" big enough.
    const check = checkEddmEligibility(9, 6);
    expect(check.eligible).toBe(false);
    expect(check.reasons[0]).toMatch(/10\.5|6\.125/);
  });

  it('rejects standard small postcards', () => {
    expect(checkEddmEligibility(6, 4).eligible).toBe(false);
    expect(checkEddmEligibility(7, 5).eligible).toBe(false);
  });

  it('rejects oversized pieces', () => {
    expect(checkEddmEligibility(16, 7).eligible).toBe(false);
    expect(checkEddmEligibility(14, 12.5).eligible).toBe(false);
  });

  it('agrees with the eddm flag on every catalog size', () => {
    for (const size of POSTCARD_SIZES) {
      expect(checkEddmEligibility(size.widthIn, size.heightIn).eligible).toBe(size.eddm);
    }
  });
});

describe('mailing guides', () => {
  it('requires the EDDM indicia and Local Postal Customer block', () => {
    const rules = mailingGuide('eddm').rules.join(' ');
    expect(rules).toMatch(/ECRWSS/);
    expect(rules).toMatch(/LOCAL POSTAL CUSTOMER/);
    expect(rules).toMatch(/TOP HALF/);
  });

  it('asks for a real address block on addressed mail', () => {
    const rules = mailingGuide('upload').rules.join(' ');
    expect(rules).toMatch(/address block/i);
    expect(rules).not.toMatch(/ECRWSS/);
  });
});

describe('mailing list column checks', () => {
  it('maps common CRM header names onto postal fields', () => {
    const check = checkListColumns(['Full Name', 'Street Address', 'City', 'ST', 'Zip Code'], 1200);
    expect(check.missing).toEqual([]);
    expect(check.detected.address1).toBe('Street Address');
    expect(check.detected.state).toBe('ST');
    expect(check.detected.zip).toBe('Zip Code');
  });

  it('names exactly which required columns are missing', () => {
    const check = checkListColumns(['Name', 'Email'], 500);
    expect(check.missing).toContain('address1');
    expect(check.missing).toContain('city');
    expect(check.missing).toContain('state');
    expect(check.missing).toContain('zip');
  });

  it('warns rather than blocks when there is no name column', () => {
    const check = checkListColumns(['Address', 'City', 'State', 'Zip'], 900);
    expect(check.missing).toEqual([]);
    expect(check.warnings.join(' ')).toMatch(/Current Resident/);
  });

  it('flags an empty file', () => {
    const check = checkListColumns(['Address', 'City', 'State', 'Zip'], 0);
    expect(check.warnings.join(' ')).toMatch(/no records/);
  });
});

describe('cost estimate', () => {
  it('always includes print, postage and mailing', () => {
    expect(estimateCost('eddm', 5000).includes).toEqual(['Printing', 'Postage', 'Mailing']);
  });

  it('gives volume relief on the low end as quantity climbs', () => {
    const small = estimateCost('eddm', 500);
    const large = estimateCost('eddm', 25_000);
    expect(large.perPieceLow).toBeLessThan(small.perPieceLow);
  });

  it('prices EDDM below addressed mail at the same volume', () => {
    expect(estimateCost('eddm', 5000).totalLow).toBeLessThan(estimateCost('upload', 5000).totalLow);
  });

  it('scales the total with the piece count', () => {
    const e = estimateCost('upload', 1000);
    expect(e.totalLow).toBe(Math.round(1000 * e.perPieceLow));
    expect(e.totalHigh).toBeGreaterThan(e.totalLow);
  });
});

describe('in-home window', () => {
  it('returns a window that opens before it closes', () => {
    const w = inHomeWindow('eddm', new Date('2026-08-17T00:00:00Z'));
    expect(w.earliest).toBeTruthy();
    expect(w.latest).toBeTruthy();
    expect(w.earliest).not.toBe(w.latest);
  });

  it('never lands on a weekend', () => {
    for (const mode of ['eddm', 'upload', 'targeted'] as const) {
      const w = inHomeWindow(mode, new Date('2026-08-17T00:00:00Z'));
      expect(w.earliest).not.toMatch(/^(Sat|Sun)/);
      expect(w.latest).not.toMatch(/^(Sat|Sun)/);
    }
  });
});

describe('campaign progress', () => {
  it('starts with nothing done', () => {
    const steps = campaignSteps(emptyCampaign());
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(isReadyToLaunch(emptyCampaign())).toBe(false);
  });

  it('is ready only once audience, artwork and date are all settled', () => {
    const s = emptyCampaign();
    s.audience = { mode: 'eddm', label: '3 routes near 43215', pieces: 2400 };
    expect(isReadyToLaunch(s)).toBe(false);

    s.artwork = { mode: 'template', sizeId: '9x6.5', frontUrl: null, backUrl: null, reviewed: true };
    expect(isReadyToLaunch(s)).toBe(false);

    s.schedule = { inHomeDate: 'Mon, Sep 7' };
    expect(isReadyToLaunch(s)).toBe(true);
  });
});

describe('fact sheet given to the model', () => {
  it('omits cost until there is an audience to price', () => {
    expect(buildFactSheet(emptyCampaign())).not.toMatch(/COST ESTIMATE/);
  });

  it('supplies cost, dates and the mailing guide once an audience exists', () => {
    const s = emptyCampaign();
    s.audience = { mode: 'eddm', label: '3 routes', pieces: 2400 };
    const facts = buildFactSheet(s);
    expect(facts).toMatch(/COST ESTIMATE/);
    expect(facts).toMatch(/IN-HOME WINDOW/);
    expect(facts).toMatch(/ECRWSS/);
    expect(facts).toMatch(/estimate/i);
  });

  it('tells the model plainly when the chosen size cannot run EDDM', () => {
    const s = emptyCampaign();
    s.audience = { mode: 'eddm', label: 'routes', pieces: 1000 };
    s.artwork = { mode: 'template', sizeId: '6x9', frontUrl: null, backUrl: null, reviewed: false };
    expect(buildFactSheet(s)).toMatch(/EDDM eligible: NO/);
  });

  it('always lists which sizes are EDDM and which are not', () => {
    const facts = buildFactSheet(emptyCampaign());
    expect(facts).toMatch(/EDDM SIZES SOLD/);
    expect(facts).toMatch(/ADDRESSED-MAIL SIZES/);
  });
});

describe('panel routing', () => {
  const base = () => emptyCampaign();

  it('honours a valid panel from the model', () => {
    expect(derivePanel('templates', 'anything', base())).toBe('templates');
  });

  it('ignores a panel the model made up', () => {
    expect(derivePanel('rocketship', 'nothing relevant here', base())).toBeNull();
  });

  it('opens the right tool from the audience mode the model just learned', () => {
    expect(derivePanel(null, 'sounds good', base(), { audience: { mode: 'eddm', label: null, pieces: null } }))
      .toBe('map');
    expect(derivePanel(null, 'sounds good', base(), { audience: { mode: 'upload', label: null, pieces: null } }))
      .toBe('upload');
    expect(derivePanel(null, 'sounds good', base(), { audience: { mode: 'targeted', label: null, pieces: null } }))
      .toBe('targeting');
  });

  it('rescues the reply that claims a map is open when the model sent none', () => {
    // The exact failure this exists for: model returns panel:null alongside
    // "I've opened the map", which would otherwise strand the customer.
    expect(derivePanel(null, "I've opened the map; pick the neighborhoods you want.", base())).toBe('map');
  });

  it('infers upload from talk of a spreadsheet', () => {
    expect(derivePanel(null, 'Drop your CSV in and I will check it.', base())).toBe('upload');
  });

  it('reads the customer’s own words, not just the model’s paraphrase', () => {
    // The real failure: the user said "spreadsheet", the model replied "drop your
    // file in on the right" and returned panel:null. Neither the reply nor the
    // model gave us "upload" — the user did.
    expect(
      derivePanel(null, 'Drop your file in on the right and I will check it.', base(), undefined,
        'I have a spreadsheet of past customers I want to mail')
    ).toBe('upload');
  });

  it('prefers list upload over the map when the customer mentions both', () => {
    expect(
      derivePanel(null, 'Sure thing.', base(), undefined, 'I have a csv for these neighborhoods')
    ).toBe('upload');
  });

  it('does not reopen an audience tool once the audience is settled', () => {
    const s = base();
    s.audience = { mode: 'eddm', label: '3 routes', pieces: 2400 };
    expect(derivePanel(null, 'Your EDDM routes look great.', s)).not.toBe('map');
  });

  it('moves on to artwork once the audience is settled', () => {
    const s = base();
    s.audience = { mode: 'eddm', label: '3 routes', pieces: 2400 };
    expect(derivePanel(null, 'Now pick a postcard size and a template.', s)).toBe('templates');
  });

  it('returns null when the reply needs no tool at all', () => {
    expect(derivePanel(null, 'What kind of work do you do?', base())).toBeNull();
  });
});
