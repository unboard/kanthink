import { describe, it, expect } from 'vitest'
import { buildSite, makeBoard } from '../app/mow/lawns'
import { hasLostCat, planLostCat } from '../app/mow/cats'

describe('Clean Cut lost cats', () => {
  const jobs = Array.from({ length: 12 }, (_, d) => makeBoard(1000 + d * 7919).jobs).flat()

  it('the board flag matches the plan, and plenty of jobs have a cat', () => {
    let withCat = 0
    for (const j of jobs) {
      const plan = planLostCat(j, buildSite(j.template, j.seed))
      expect(!!plan).toBe(hasLostCat(j))
      if (plan) withCat++
    }
    expect(withCat / jobs.length).toBeGreaterThan(0.4)
  })

  it('hides in the yard being mowed, away from where you park, and the owner waits nearby', () => {
    for (const j of jobs) {
      const site = buildSite(j.template, j.seed)
      const plan = planLostCat(j, site)
      if (!plan) continue
      const b = site.bounds
      expect(plan.spots.length).toBeGreaterThan(0)
      for (const [x, z] of plan.spots) {
        expect(x).toBeGreaterThan(b.x0 - 2.01)
        expect(x).toBeLessThan(b.x1 + 2.01)
        expect(z).toBeGreaterThan(b.z0 - 2.01)
        expect(z).toBeLessThan(b.z1 + 2.01)
        expect(Math.hypot(x - site.start.x, z - site.start.z)).toBeGreaterThan(6.9)
      }
      const o = plan.ownerAt
      expect(Math.hypot(o.x - site.start.x, o.z - site.start.z)).toBeLessThan(30)
      expect(plan.reward).toBeGreaterThan(0)
    }
  })

  it('is the same cat for everyone on the same job', () => {
    const j = jobs.find(hasLostCat)!
    const a = planLostCat(j, buildSite(j.template, j.seed))
    const b = planLostCat(j, buildSite(j.template, j.seed))
    expect(a).toEqual(b)
  })
})
