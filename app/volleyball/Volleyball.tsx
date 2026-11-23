'use client';

import CourtGame from '../pickleball/CourtGame';
import { VOLLEYBALL } from './volley';

export default function Volleyball() {
  return <CourtGame sport={VOLLEYBALL} />;
}
