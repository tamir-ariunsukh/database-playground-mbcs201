import { SeededRandom, isoDate, isoTimestamp, mongolianEmail, mongolianName, mongolianPhone } from '../seed'
import type { DomainDefinition } from './types'

/**
 * Hospital — эмнэлгийн систем.
 *
 * Гол онцлог: patients ↔ doctors нь appointments-аар many-to-many
 * холбогдоно. Мөн нэг doctor олон appointment-тай, нэг patient
 * олон prescription-тай — 1:N хамаарлын жишээ.
 */

const DDL = `
CREATE TABLE departments (
  department_id SERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL UNIQUE,
  floor         INT CHECK (floor BETWEEN 1 AND 10),
  phone         VARCHAR(20)
);

CREATE TABLE doctors (
  doctor_id     SERIAL PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  department_id INT NOT NULL REFERENCES departments(department_id),
  specialty     VARCHAR(80),
  license_no    VARCHAR(30) NOT NULL UNIQUE,
  hire_date     DATE NOT NULL,
  salary        NUMERIC(12,2) CHECK (salary > 0)
);

CREATE TABLE patients (
  patient_id    SERIAL PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  birth_date    DATE NOT NULL,
  gender        CHAR(1) CHECK (gender IN ('M', 'F')),
  blood_type    VARCHAR(3) CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  phone         VARCHAR(20),
  city          VARCHAR(50),
  insurance_no  VARCHAR(30) UNIQUE,
  registered_on DATE NOT NULL
);

CREATE TABLE appointments (
  appointment_id SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  doctor_id      INT NOT NULL REFERENCES doctors(doctor_id),
  scheduled_at   TIMESTAMP NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'Товлосон'
    CHECK (status IN ('Товлосон', 'Ирсэн', 'Ирээгүй', 'Цуцлагдсан', 'Дууссан')),
  diagnosis      TEXT,
  fee            NUMERIC(10,2) CHECK (fee >= 0)
);

CREATE TABLE prescriptions (
  prescription_id SERIAL PRIMARY KEY,
  appointment_id  INT NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  medication      VARCHAR(120) NOT NULL,
  dosage          VARCHAR(60),
  duration_days   INT CHECK (duration_days BETWEEN 1 AND 365),
  is_covered      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_time ON appointments(scheduled_at);
`.trim()

function generateSeed(): string {
  const rng = new SeededRandom('hospital-v1')
  const q = (s: unknown) =>
    s === null || s === undefined
      ? 'NULL'
      : typeof s === 'number'
        ? String(s)
        : typeof s === 'boolean'
          ? s
            ? 'TRUE'
            : 'FALSE'
          : `'${String(s).replace(/'/g, "''")}'`

  const out: string[] = ['-- Hospital жишээ дата (seed: hospital-v1)']

  const departments: [string, number, string][] = [
    ['Дотор', 1, '7011-1111'],
    ['Мэс засал', 2, '7011-2222'],
    ['Хүүхэд', 2, '7011-3333'],
    ['Эмэгтэйчүүд', 3, '7011-4444'],
    ['Зүрх судас', 3, '7011-5555'],
    ['Яаралтай тусламж', 1, '7011-6666'],
    ['Шүд', 4, '7011-7777'],
    ['Нүд', 4, '7011-8888'],
    ['Сэтгэл зүй', 5, '7011-9999'],
    ['Арьс', 5, '7011-0000'],
  ]
  out.push('\n-- departments: 10 мөр')
  departments.forEach(([name, floor, phone]) => {
    out.push(`INSERT INTO departments (name, floor, phone) VALUES (${q(name)}, ${floor}, ${q(phone)});`)
  })

  const specialties = [
    'Дотрын эмч', 'Мэс заслын эмч', 'Хүүхдийн эмч', 'Эмэгтэйчүүдийн эмч',
    'Зүрхний эмч', 'Яаралтай тусламжийн эмч', 'Шүдний эмч', 'Нүдний эмч',
    'Сэтгэл зүйч', 'Арьсны эмч',
  ]
  out.push('\n-- doctors: 45 мөр')
  const licensePool = new Set<string>()
  for (let i = 1; i <= 45; i++) {
    const { first, last } = mongolianName(rng)
    const deptId = rng.int(1, 10)
    let lic = `MD-${rng.int(10000, 99999)}`
    while (licensePool.has(lic)) lic = `MD-${rng.int(10000, 99999)}`
    licensePool.add(lic)
    const hire = rng.dateBetween(new Date('2005-01-01'), new Date('2024-06-01'))
    const salary = rng.int(1800000, 6500000)
    out.push(
      `INSERT INTO doctors (first_name, last_name, department_id, specialty, license_no, hire_date, salary) VALUES (${q(first)}, ${q(last)}, ${deptId}, ${q(specialties[deptId - 1])}, ${q(lic)}, ${q(isoDate(hire))}, ${salary});`,
    )
  }

  out.push('\n-- patients: 150 мөр')
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  for (let i = 1; i <= 150; i++) {
    const { first, last } = mongolianName(rng)
    const birth = rng.dateBetween(new Date('1945-01-01'), new Date('2023-12-01'))
    const age = new Date('2025-09-30').getFullYear() - birth.getFullYear()
    const gender = rng.chance(0.48) ? 'M' : 'F'
    // Цусны бүлэг Монголд: O+ хамгийн түгээмэл
    const bt = rng.weighted([
      { value: 'O+', weight: 32 }, { value: 'A+', weight: 26 },
      { value: 'B+', weight: 22 }, { value: 'AB+', weight: 8 },
      { value: 'O-', weight: 4 }, { value: 'A-', weight: 3 },
      { value: 'B-', weight: 3 }, { value: 'AB-', weight: 2 },
    ])
    const city = rng.weighted([
      { value: 'Улаанбаатар', weight: 55 },
      { value: 'Дархан', weight: 12 },
      { value: 'Эрдэнэт', weight: 10 },
      { value: 'Чойбалсан', weight: 8 },
      { value: 'Мөрөн', weight: 6 },
      { value: 'Ховд', weight: 5 },
      { value: 'Улаангом', weight: 4 },
    ])
    const reg = rng.dateBetween(new Date('2018-01-01'), new Date('2025-08-01'))
    const insNo = age > 16 ? `INS-${rng.int(1000000, 9999999)}` : null

    out.push(
      `INSERT INTO patients (first_name, last_name, birth_date, gender, blood_type, phone, city, insurance_no, registered_on) VALUES (${q(first)}, ${q(last)}, ${q(isoDate(birth))}, ${q(gender)}, ${q(bt)}, ${q(mongolianPhone(rng))}, ${q(city)}, ${insNo ? q(insNo) : 'NULL'}, ${q(isoDate(reg))});`,
    )
  }

  const diagnoses = [
    'Ханиад', 'Хоолойн үрэвсэл', 'Ходоодны шарх', 'Цусны даралт өндөр',
    'Чихрийн шижин', 'Харшил', 'Хүзүүний өвдөлт', 'Нурууны өвдөлт',
    'Артерийн өвчин', 'Бөөрний үрэвсэл', 'Уушгины үрэвсэл', 'Мигрень',
    'Арьсны харшил', 'Шүдний цоорол', 'Хараа муудах',
  ]

  out.push('\n-- appointments: 400 мөр')
  const apptLines: string[] = []
  const prescLines: string[] = ['\n-- prescriptions: ~450 мөр']
  let prescCount = 0

  const medications = [
    'Парацетамол', 'Ибупрофен', 'Амоксициллин', 'Омепразол', 'Аторвастатин',
    'Метформин', 'Лоратадин', 'Цетиризин', 'Аспирин', 'Витамин D',
    'Кальций', 'Магний', 'Ибупрофен гель', 'Спрей', 'Дуслын эм',
  ]
  const dosages = ['500мг өдөрт 3 удаа', '250мг өдөрт 2 удаа', '10мл өдөрт 1 удаа',
    '1 шахмал өдөрт 1 удаа', '2 шахмал өдөрт 2 удаа', '1 троп өдөрт 3 удаа']

  for (let aid = 1; aid <= 400; aid++) {
    const patientId = rng.int(1, 150)
    const doctorId = rng.int(1, 45)
    const scheduled = rng.dateBetween(new Date('2024-09-01'), new Date('2025-09-25'))
    const status = rng.weighted([
      { value: 'Дууссан', weight: 60 },
      { value: 'Ирсэн', weight: 12 },
      { value: 'Товлосон', weight: 15 },
      { value: 'Ирээгүй', weight: 8 },
      { value: 'Цуцлагдсан', weight: 5 },
    ])
    const hasDiagnosis = status === 'Дууссан' || status === 'Ирсэн'
    const diagnosis = hasDiagnosis ? rng.pick(diagnoses) : null
    const fee = hasDiagnosis ? rng.weighted([
      { value: 15000, weight: 30 }, { value: 25000, weight: 25 },
      { value: 35000, weight: 20 }, { value: 50000, weight: 15 },
      { value: 80000, weight: 10 },
    ]) : 0

    apptLines.push(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, status, diagnosis, fee) VALUES (${patientId}, ${doctorId}, ${q(isoTimestamp(scheduled))}, ${q(status)}, ${diagnosis ? q(diagnosis) : 'NULL'}, ${fee});`,
    )

    // Дууссан appointment-д 1-3 prescription
    if (hasDiagnosis) {
      const n = rng.weighted([
        { value: 1, weight: 40 }, { value: 2, weight: 38 }, { value: 3, weight: 22 },
      ])
      for (let k = 0; k < n; k++) {
        prescLines.push(
          `INSERT INTO prescriptions (appointment_id, medication, dosage, duration_days, is_covered) VALUES (${aid}, ${q(rng.pick(medications))}, ${q(rng.pick(dosages))}, ${rng.int(3, 30)}, ${q(rng.chance(0.78))});`,
        )
        prescCount++
      }
    }
  }

  out.push(...apptLines)
  out.push(...prescLines)
  out.push(`\n-- Нийт ${10 + 45 + 150 + 400 + prescCount} мөр оруулсан`)
  return out.join('\n')
}

export const hospitalDomain: DomainDefinition = {
  id: 'hospital',
  label: 'Эмнэлэг',
  weeks: [2, 3, 4, 6, 7, 9, 10, 11, 12],
  description:
    'Эмнэлгийн систем: эмч, өвчтөн, цаг товлолт, жор. Many-to-many хамаарал болон NULL утгын ач холбогдлыг харуулна.',
  ddl: DDL,
  seed: generateSeed(),
  examples: [
    {
      title: 'Насны тооцоолол',
      week: 5,
      sql: `SELECT first_name, last_name, birth_date,
       DATE_PART('year', AGE(birth_date)) AS age
FROM patients
WHERE birth_date < '1970-01-01'
ORDER BY birth_date
LIMIT 15;`,
      explanation:
        "`AGE()` нь огнооны зөрүүг interval болгож буцаана, `DATE_PART('year', ...)` нь жилийг гаргана. Огнооны арифметик нь SQL-ийн чухал чадвар — гараар тооцоолол хийх шаардлагагүй.",
    },
    {
      title: 'Хамгийн олон цаг товлосон эмч',
      week: 7,
      sql: `SELECT d.first_name, d.last_name, dep.name AS department,
       COUNT(*) AS appointments
FROM doctors d
JOIN departments dep ON d.department_id = dep.department_id
JOIN appointments a ON d.doctor_id = a.doctor_id
GROUP BY d.doctor_id, d.first_name, d.last_name, dep.name
ORDER BY appointments DESC
LIMIT 10;`,
      explanation:
        'Гурван хүснэгтийн JOIN + GROUP BY. `d.doctor_id`-г GROUP BY-д оруулах ёстой — нэр давхцаж болзошгүй.',
    },
    {
      title: 'Хэзээ ч цаг авалгүй өвчтөн (LEFT JOIN)',
      week: 9,
      sql: `SELECT p.patient_id, p.first_name, p.last_name, p.city
FROM patients p
LEFT JOIN appointments a ON p.patient_id = a.patient_id
WHERE a.appointment_id IS NULL
ORDER BY p.registered_on;`,
      explanation:
        'Anti-join. Бодит эмнэлэгт "бүртгэлтэй ч ирээгүй" өвчтөнүүдийг олох — урьдчилан сэргийлэх ажлын суурь.',
    },
    {
      title: 'Цусны бүлгээр тархалт',
      week: 7,
      sql: `SELECT blood_type,
       COUNT(*) AS patients,
       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM patients), 1) AS percent
FROM patients
GROUP BY blood_type
ORDER BY patients DESC;`,
      explanation:
        'Subquery-г SELECT дотор ашиглаж нийт тоог гаргаад хувь бодно. `100.0` гэж бичих нь чухал — `100` гэвэл бүхэл тоон хуваалт болж 0 гарна.',
    },
    {
      title: 'Ирээгүй цаг товлолтын хувь',
      week: 7,
      sql: `SELECT status, COUNT(*) AS count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percent
FROM appointments
GROUP BY status
ORDER BY count DESC;`,
      explanation:
        '`SUM(COUNT(*)) OVER ()` — window function нь aggregate-ийн үр дүн дээр ажиллана. Энэ нь "нийт дүнгийн хэдэн хувь" бодох хамгийн цэвэр арга.',
    },
    {
      title: 'Дундаж цалингаас өндөр эмч',
      week: 10,
      sql: `SELECT d.first_name, d.last_name, dep.name AS department, d.salary
FROM doctors d
JOIN departments dep ON d.department_id = dep.department_id
WHERE d.salary > (SELECT AVG(salary) FROM doctors)
ORDER BY d.salary DESC;`,
      explanation:
        'Scalar subquery нэг утга буцаана. Ижил үр дүнг `WHERE salary > (SELECT ...)`-ийн оронд window function-оор ч гаргаж болно.',
    },
    {
      title: 'Тэнхимийн цалингийн статистик',
      week: 7,
      sql: `SELECT dep.name AS department,
       COUNT(d.doctor_id) AS doctors,
       ROUND(AVG(d.salary), 2) AS avg_salary,
       MIN(d.salary) AS min_salary,
       MAX(d.salary) AS max_salary
FROM departments dep
LEFT JOIN doctors d ON dep.department_id = d.department_id
GROUP BY dep.department_id, dep.name
ORDER BY avg_salary DESC NULLS LAST;`,
      explanation:
        'LEFT JOIN ашигласнаар эмчгүй тэнхим ч гарах болно — AVG нь NULL болно. `NULLS LAST` нь тэднийг хамгийн сүүлд тавина.',
    },
    {
      title: 'Олон жор бичсэн цаг товлолт',
      week: 10,
      sql: `SELECT a.appointment_id, a.scheduled_at, a.diagnosis,
       COUNT(pr.prescription_id) AS prescription_count
FROM appointments a
JOIN prescriptions pr ON a.appointment_id = pr.appointment_id
GROUP BY a.appointment_id, a.scheduled_at, a.diagnosis
HAVING COUNT(pr.prescription_id) >= 3
ORDER BY prescription_count DESC, a.scheduled_at DESC
LIMIT 20;`,
      explanation:
        'JOIN + GROUP BY + HAVING — "олон холбоотой мөртэй" бичлэгүүдийг олох стандарт хэв маяг.',
    },
    {
      title: 'Эмч бүрийн өвчтөний тоо (DISTINCT)',
      week: 7,
      sql: `SELECT d.first_name, d.last_name,
       COUNT(DISTINCT a.patient_id) AS unique_patients,
       COUNT(*) AS total_visits
FROM doctors d
JOIN appointments a ON d.doctor_id = a.doctor_id
GROUP BY d.doctor_id, d.first_name, d.last_name
ORDER BY unique_patients DESC
LIMIT 10;`,
      explanation:
        '`COUNT(DISTINCT patient_id)` нь давхардсан өвчтөнийг нэг л удаа тоолно — нэг хүн 5 удаа ирсэн ч 1. `COUNT(*)` нь нийт ирц. Хоёрын ялгаа нь чухал.',
    },
    {
      title: 'Сарын ирцийн тоо',
      week: 7,
      sql: `SELECT TO_CHAR(scheduled_at, 'YYYY-MM') AS month,
       COUNT(*) AS appointments,
       COUNT(*) FILTER (WHERE status = 'Ирээгүй') AS no_shows,
       ROUND(COUNT(*) FILTER (WHERE status = 'Ирээгүй') * 100.0 / COUNT(*), 1) AS no_show_pct
FROM appointments
GROUP BY TO_CHAR(scheduled_at, 'YYYY-MM')
ORDER BY month;`,
      explanation:
        "`COUNT(*) FILTER (WHERE ...)` — Postgres-ийн гоёмсог боломж, нэг query-д олон нөхцөлт тоолол хийхэд. MySQL-д `SUM(CASE WHEN ... THEN 1 END)` гэж бичнэ.",
    },
    {
      title: 'Хамгийн түгээмэл оношилгоо',
      week: 10,
      sql: `SELECT diagnosis, COUNT(*) AS cases,
       COUNT(DISTINCT patient_id) AS patients,
       ROUND(AVG(fee), 2) AS avg_fee
FROM appointments
WHERE diagnosis IS NOT NULL
GROUP BY diagnosis
ORDER BY cases DESC
LIMIT 10;`,
      explanation:
        "`diagnosis IS NOT NULL` — ирээгүй/цуцлагдсан цагт оношилгоо байхгүй. NULL-ийг зөв шалгах нь маш чухал: `diagnosis != NULL` гэж бичвэл үр дүн хоосон гарна.",
    },
    {
      title: 'VIEW — өвчтөний бүрэн түүх',
      week: 12,
      sql: `CREATE VIEW patient_history AS
SELECT p.patient_id,
       p.first_name || ' ' || p.last_name AS patient,
       a.scheduled_at, a.diagnosis, a.fee,
       d.first_name || ' ' || d.last_name AS doctor,
       dep.name AS department
FROM patients p
JOIN appointments a ON p.patient_id = a.patient_id
JOIN doctors d ON a.doctor_id = d.doctor_id
JOIN departments dep ON d.department_id = dep.department_id
WHERE a.status IN ('Дууссан', 'Ирсэн');

-- Ашиглах:
SELECT patient, COUNT(*) AS visits, SUM(fee) AS total_paid
FROM patient_history
GROUP BY patient_id, patient
ORDER BY total_paid DESC
LIMIT 10;`,
      explanation:
        'VIEW нь нарийн query-г нууж, энгийн хүснэгт мэт ашиглах боломж өгнө. Мөн аюулгүй байдал — хэрэглэгчид зөвхөн view-г нээж, суурь хүснэгтэд хандахгүй байх боломжтой.',
    },
    {
      title: 'Хамгийн сүүлийн үзлэгийн оношилгоо (correlated)',
      week: 10,
      sql: `SELECT p.first_name, p.last_name,
       (SELECT a.diagnosis
        FROM appointments a
        WHERE a.patient_id = p.patient_id AND a.diagnosis IS NOT NULL
        ORDER BY a.scheduled_at DESC LIMIT 1) AS last_diagnosis
FROM patients p
ORDER BY p.last_name
LIMIT 15;`,
      explanation:
        'Correlated subquery + ORDER BY + LIMIT 1 = "сүүлийн бичлэг". PostgreSQL-д `DISTINCT ON` эсвэл window function нь илүү үр дүнтэй хувилбар.',
    },
    {
      title: 'Давхар товлолт (өгөгдлийн чанар шалгах)',
      week: 10,
      sql: `SELECT patient_id, scheduled_at, COUNT(*) AS duplicates
FROM appointments
GROUP BY patient_id, scheduled_at
HAVING COUNT(*) > 1
ORDER BY duplicates DESC;`,
      explanation:
        'Ижил өвчтөнд яг ижил цагт давхар товлолт байгаа эсэхийг шалгана. Ийм query нь өгөгдлийн чанарын шалгалтад (data quality audit) өдөр бүр ажилладаг.',
    },
    {
      title: 'Transaction — цаг товлох',
      week: 13,
      category: 'transaction',
      mutates: true,
      sql: `BEGIN;

-- Өвчтөн бүртгэх
INSERT INTO patients (first_name, last_name, birth_date, gender, blood_type, registered_on)
VALUES ('Шинэ', 'Өвчтөн', '1995-03-15', 'M', 'O+', CURRENT_DATE)
RETURNING patient_id;

-- Цаг товлох
INSERT INTO appointments (patient_id, doctor_id, scheduled_at, status)
VALUES (151, 1, '2025-10-15 10:00:00', 'Товлосон');

COMMIT;`,
      explanation:
        'Хоёр INSERT нэг transaction-д — эсвэл хоёулаа амжилттай, эсвэл хоёулаа цуцлагдана. Хэрэв эхнийх нь амжилттай, хоёр дахь нь алдаа гарвал өвчтөн бүртгэлгүй үлдэхгүй.',
    },
  ],
  challenges: [
    {
      id: 'hosp-1',
      title: 'Настай өвчтөн',
      task: '1960-оос өмнө төрсөн өвчтөнүүдийн нэр, төрсөн он-г гарга. Төрсөн оноор эрэмбэл.',
      expectedColumns: ['first_name', 'last_name', 'birth_date'],
      hint: "WHERE birth_date < '1960-01-01' ORDER BY birth_date",
      solution:
        "SELECT first_name, last_name, birth_date FROM patients WHERE birth_date < '1960-01-01' ORDER BY birth_date;",
    },
    {
      id: 'hosp-2',
      title: 'Цусны бүлгийн тоо',
      task: 'Цусны бүлэг тус бүрээр өвчтөний тоог гарга. Багана: blood_type, patient_count.',
      expectedColumns: ['blood_type', 'patient_count'],
      hint: 'GROUP BY blood_type',
      solution:
        'SELECT blood_type, COUNT(*) AS patient_count FROM patients GROUP BY blood_type ORDER BY patient_count DESC;',
    },
    {
      id: 'hosp-3',
      title: 'Өндөр цалинтай эмч',
      task: '5,000,000₮-өөс дээш цалинтай эмчдийн нэр, мэргэжил, цалинг гарга.',
      expectedColumns: ['first_name', 'last_name', 'specialty', 'salary'],
      hint: 'WHERE salary > 5000000 ORDER BY salary DESC',
      solution:
        'SELECT first_name, last_name, specialty, salary FROM doctors WHERE salary > 5000000 ORDER BY salary DESC;',
    },
    {
      id: 'hosp-4',
      title: 'Хамгийн залуу өвчтөн',
      task: 'Хамгийн сүүлд төрсөн өвчтөний нэр болон төрсөн огноог гарга.',
      expectedRowCount: 1,
      expectedColumns: ['first_name', 'last_name', 'birth_date'],
      hint: 'ORDER BY birth_date DESC LIMIT 1',
      solution: 'SELECT first_name, last_name, birth_date FROM patients ORDER BY birth_date DESC LIMIT 1;',
    },
    {
      id: 'hosp-5',
      title: 'Ажилчид ихтэй тэнхим',
      task: '3-аас дээш эмчтэй тэнхимийн нэр болон эмчдийн тоог гарга.',
      expectedColumns: ['name', 'doctor_count'],
      hint: 'JOIN departments → doctors, GROUP BY, HAVING COUNT(*) > 3',
      solution: `SELECT dep.name, COUNT(*) AS doctor_count
FROM departments dep JOIN doctors d ON dep.department_id = d.department_id
GROUP BY dep.department_id, dep.name
HAVING COUNT(*) > 3 ORDER BY doctor_count DESC;`,
    },
  ],
}
