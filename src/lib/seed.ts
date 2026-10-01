import seedrandom from 'seedrandom'

/**
 * Тогтвортой seed generator.
 *
 * Яагаад тогтвортой байх ёстой вэ:
 *   - Бүх хүүхэд ЯГ ИЖИЛ үр дүн харна → багш хариултыг урьдчилан мэдэж шалгана
 *   - Хуудас refresh хийхэд өгөгдөл өөрчлөгдөхгүй
 *   - "Reset" дарахад яг анхны байдалд буцна
 *
 * Seed нь домэйн тус бүрд өөр тул 5 domain-ийн өгөгдөл давхцахгүй,
 * гэхдээ домэйн дотор тогтвортой.
 */
export class SeededRandom {
  private rng: () => number

  constructor(seed: string) {
    this.rng = seedrandom(seed)
  }

  /** [min, max] хооронд бүхэл тоо. */
  int(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min
  }

  /** [0, 1) хооронд бутархай. */
  float(): number {
    return this.rng()
  }

  /** Массивaас санамсаргүй нэг элемент. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length)]
  }

  /** Массивaас n ширхэг давхцалгүй элемент. */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr]
    const out: T[] = []
    const count = Math.min(n, copy.length)
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.rng() * copy.length)
      out.push(copy.splice(idx, 1)[0])
    }
    return out
  }

  /** Магадлал p-тай true. */
  chance(p: number): boolean {
    return this.rng() < p
  }

  /** Хоёр огнооны хооронд санамсаргүй Date. */
  dateBetween(from: Date, to: Date): Date {
    const t = from.getTime() + this.rng() * (to.getTime() - from.getTime())
    return new Date(t)
  }

  /** Массивыг Fisher-Yates-аар холино (шинэ массив буцаана). */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  /** Магадлалын жингийн дагуу сонгоно. */
  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0)
    let r = this.rng() * total
    for (const item of items) {
      r -= item.weight
      if (r <= 0) return item.value
    }
    return items[items.length - 1].value
  }
}

// ---------------------------------------------------------------------------
// Монгол нэрсийн сан — хичээлийн хүрээнд ойлгомжтой, оюутанд ойр
// ---------------------------------------------------------------------------

export const MONGOLIAN_SURNAMES = [
  'Бат', 'Дорж', 'Сүх', 'Ган', 'Эрдэнэ', 'Мөнх', 'Төмөр', 'Чинбат',
  'Очир', 'Даваа', 'Лхагва', 'Жамъян', 'Нацагдорж', 'Бямба', 'Цэрэн',
  'Энх', 'Болд', 'Содном', 'Хүрэл', 'Алтан', 'Ууган', 'Дагва',
  'Ширнэн', 'Мягмар', 'Ням', 'Хишиг', 'Билгүүн', 'Тэмүүлэн', 'Од', 'Сарнай',
] as const

export const MONGOLIAN_GIVEN_NAMES = [
  'Болд', 'Сараа', 'Энхжин', 'Тэмүүлэн', 'Оюунаа', 'Ганбаатар', 'Мөнхзул',
  'Ануу', 'Хонгорзул', 'Дөлгөөн', 'Ариунаа', 'Батбаяр', 'Наранцэцэг',
  'Отгонбаяр', 'Солонго', 'Түвшин', 'Үйзэн', 'Хатанбаатар', 'Эрхэм',
  'Амар', 'Билэг', 'Сүндэр', 'Намуун', 'Идэр', 'Тэнүүн', 'Золбоо',
  'Марал', 'Гоо', 'Тунгалаг', 'Алтанцэцэг', 'Цэцгээ', 'Хүслэн',
  'Бумбаяр', 'Дэлгэр', 'Эгшиг', 'Мөнх-Эрдэнэ', 'Бадрах', 'Төгөлдөр',
] as const

export const MONGOLIAN_CITIES = [
  'Улаанбаатар', 'Дархан', 'Эрдэнэт', 'Чойбалсан', 'Мөрөн',
  'Ховд', 'Улаангом', 'Баянхонгор', 'Арвайхээр', 'Сүхбаатар',
  'Зүүнхараа', 'Цэцэрлэг', 'Улиастай', 'Алтай', 'Мандалговь',
] as const

export const MONGOLIAN_DISTRICTS = [
  'Баянзүрх', 'Сүхбаатар', 'Чингэлтэй', 'Хан-Уул', 'Баянгол',
  'Сонгинохайрхан', 'Налайх', 'Багануур', 'Багануур',
] as const

/** Монгол утасны дугаар: 8 оронтой, 8/9/7-оор эхэлнэ. */
export function mongolianPhone(rng: SeededRandom): string {
  return `${rng.pick([8, 9, 7])}${rng.int(1000000, 9999999)}`
}

/** И-мэйл: `bat.bold42@example.mn` хэлбэр. */
export function mongolianEmail(rng: SeededRandom, first: string, last: string): string {
  const translit: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
    з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  const toLatin = (s: string) =>
    s
      .toLowerCase()
      .split('')
      .map((c) => translit[c] ?? c)
      .join('')
      .replace(/[^a-z]/g, '')

  return `${toLatin(first)}.${toLatin(last)}${rng.int(1, 99)}@example.mn`
}

/** Монгол нэр үүсгэнэ. */
export function mongolianName(rng: SeededRandom): { first: string; last: string } {
  return {
    last: rng.pick(MONGOLIAN_SURNAMES),
    first: rng.pick(MONGOLIAN_GIVEN_NAMES),
  }
}

/** ISO огноо (YYYY-MM-DD) — Postgres DATE-д шууд орох хэлбэр. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** ISO timestamp (YYYY-MM-DD HH:MM:SS). */
export function isoTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * SQL утгыг literal болгоно — seed script бичихэд хэрэглэнэ.
 * `NULL`, тоо, boolean, string (escape-тай) бүгдийг зөв болгоно.
 */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v instanceof Date) return `'${isoTimestamp(v)}'`
  if (Array.isArray(v) || typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}
