'use client';

import CourtGame from '../pickleball/CourtGame';
import { SOCCER } from './football';

export default function Soccer() {
  return <CourtGame sport={SOCCER} />;
}
