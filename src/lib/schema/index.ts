import type { DomainId } from '../types'
import type { DomainDefinition } from './types'
import { libraryDomain } from './library'
import { shopDomain } from './shop'
import { hospitalDomain } from './hospital'
import { universityDomain } from './university'
import { hotelDomain } from './hotel'

/**
 * Бүх domain-ууд — MBCS201 хичээлийн Mini Project сэдвүүд.
 *
 * Эдгээрийн аль нэгийг сонгоход 3 системд (PostgreSQL, MySQL, MongoDB)
 * ижил schema + ижил өгөгдөл бэлдэгдэнэ.
 */
export const DOMAINS: DomainDefinition[] = [
  libraryDomain,
  shopDomain,
  hospitalDomain,
  universityDomain,
  hotelDomain,
]

/** Бүх domain-ийг буцаана. */
export function getDomains(): DomainDefinition[] {
  return DOMAINS
}

/** ID-аар domain олно. */
export function getDomain(id: DomainId | string): DomainDefinition | undefined {
  return DOMAINS.find((d) => d.id === id)
}

/** Долоо хоногт тохирох domain-ууд. */
export function domainsForWeek(week: number): DomainDefinition[] {
  return DOMAINS.filter((d) => d.weeks.includes(week))
}

export type { DomainDefinition, ExampleQuery, Challenge } from './types'
export { libraryDomain, shopDomain, hospitalDomain, universityDomain, hotelDomain }
