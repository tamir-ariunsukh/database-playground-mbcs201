import { SeededRandom, isoDate, mongolianEmail, mongolianName, mongolianPhone } from '../seed'
import type { DomainDefinition } from './types'

/**
 * University — их сургуулийн бүртгэлийн систем.
 *
 * Гол онцлог: оюутан ↔ хичээл нь enrollments-аар many-to-many.
 * enrollments нь НЭМЭЛТ АТРИБУТТАЙ (grade, semester) — энэ нь
 * "associative entity"-ийн классик жишээ бөгөөд Week 3-ийн
 * ERD-ээс relational схем рүү хөрвүүлэхэд маш чухал.
 */

const DDL = `
CREATE TABLE departments (
  department_id SERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL UNIQUE,
  building      VARCHAR(40),
  budget        NUMERIC(14,2) CHECK (budget >= 0)
);

CREATE TABLE instructors (
  instructor_id SERIAL PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  department_id INT NOT NULL REFERENCES departments(department_id),
  title         VARCHAR(40) CHECK (title IN ('Багш', 'Дэд профессор', 'Профессор', 'Академич')),
  email         VARCHAR(120) NOT NULL UNIQUE,
  hire_date     DATE NOT NULL
);

CREATE TABLE students (
  student_id    SERIAL PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  department_id INT NOT NULL REFERENCES departments(department_id),
  enrollment_year INT NOT NULL CHECK (enrollment_year BETWEEN 2015 AND 2025),
  gpa           NUMERIC(3,2) CHECK (gpa BETWEEN 0 AND 4),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE courses (
  course_id     SERIAL PRIMARY KEY,
  code          VARCHAR(12) NOT NULL UNIQUE,
  title         VARCHAR(120) NOT NULL,
  department_id INT NOT NULL REFERENCES departments(department_id),
  instructor_id INT REFERENCES instructors(instructor_id) ON DELETE SET NULL,
  credits       INT NOT NULL CHECK (credits BETWEEN 1 AND 6),
  capacity      INT NOT NULL DEFAULT 30 CHECK (capacity > 0)
);

CREATE TABLE enrollments (
  student_id    INT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  course_id     INT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  semester      VARCHAR(12) NOT NULL,
  grade         VARCHAR(2) CHECK (grade IN ('A','A-','B+','B','B-','C+','C','C-','D','F','W','I')),
  enrolled_on   DATE NOT NULL,
  PRIMARY KEY (student_id, course_id, semester)
);

CREATE INDEX idx_students_dept ON students(department_id);
CREATE INDEX idx_courses_dept ON courses(department_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_grade ON enrollments(grade);
`.trim()

function generateSeed(): string {
  const rng = new SeededRandom('university-v1')
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

  const out: string[] = ['-- University жишээ дата (seed: university-v1)']

  const depts: [string, string, number][] = [
    ['Мэдээллийн технологи', 'A', 850000000],
    ['Компьютерийн ухаан', 'A', 720000000],
    ['Математик', 'B', 430000000],
    ['Физик', 'B', 510000000],
    ['Эдийн засаг', 'C', 620000000],
    ['Менежмент', 'C', 480000000],
    ['Хэл шинжлэл', 'D', 290000000],
    ['Хууль', 'D', 550000000],
  ]
  out.push('\n-- departments: 8 мөр')
  depts.forEach(([name, building, budget]) => {
    out.push(`INSERT INTO departments (name, building, budget) VALUES (${q(name)}, ${q(building)}, ${budget});`)
  })

  out.push('\n-- instructors: 50 мөр')
  const titles = ['Багш', 'Дэд профессор', 'Профессор', 'Академич']
  const emailPool = new Set<string>()
  for (let i = 1; i <= 50; i++) {
    const { first, last } = mongolianName(rng)
    let email = mongolianEmail(rng, first, last)
    while (emailPool.has(email)) email = mongolianEmail(rng, first, last)
    emailPool.add(email)
    const deptId = rng.int(1, 8)
    const title = rng.weighted([
      { value: 'Багш', weight: 45 },
      { value: 'Дэд профессор', weight: 30 },
      { value: 'Профессор', weight: 20 },
      { value: 'Академич', weight: 5 },
    ])
    const hire = rng.dateBetween(new Date('2000-01-01'), new Date('2024-09-01'))
    out.push(
      `INSERT INTO instructors (first_name, last_name, department_id, title, email, hire_date) VALUES (${q(first)}, ${q(last)}, ${deptId}, ${q(title)}, ${q(email)}, ${q(isoDate(hire))});`,
    )
    void titles
  }

  out.push('\n-- students: 320 мөр')
  for (let i = 1; i <= 320; i++) {
    const { first, last } = mongolianName(rng)
    let email = mongolianEmail(rng, first, last)
    while (emailPool.has(email)) email = mongolianEmail(rng, first, last)
    emailPool.add(email)
    const deptId = rng.int(1, 8)
    const year = rng.weighted([
      { value: 2021, weight: 18 }, { value: 2022, weight: 22 },
      { value: 2023, weight: 26 }, { value: 2024, weight: 22 }, { value: 2025, weight: 12 },
    ])
    const gpa = Math.round(rng.float() * 2.4 * 100 + 160) / 100
    const active = rng.chance(0.9)

    out.push(
      `INSERT INTO students (first_name, last_name, email, phone, department_id, enrollment_year, gpa, is_active) VALUES (${q(first)}, ${q(last)}, ${q(email)}, ${q(mongolianPhone(rng))}, ${deptId}, ${year}, ${gpa}, ${q(active)});`,
    )
  }

  out.push('\n-- courses: 60 мөр')
  const courseCatalog: [string, string, number][] = [
    ['CS101', 'Програмчлалын үндэс', 2], ['CS102', 'Объект хандалтат програмчлал', 3],
    ['CS201', 'Өгөгдлийн бүтэц', 4], ['CS202', 'Алгоритм', 4],
    ['CS210', 'Өгөгдлийн сан', 3], ['CS220', 'Компьютерийн сүлжээ', 3],
    ['CS230', 'Үйлдлийн систем', 3], ['CS240', 'Программ хангамжийн инженерчлэл', 3],
    ['CS310', 'Хиймэл оюун ухаан', 3], ['CS320', 'Машин сургалт', 3],
    ['CS330', 'Веб хөгжүүлэлт', 3], ['CS340', 'Мэдээллийн аюулгүй байдал', 3],
    ['CS350', 'Үүлэн тооцоолол', 3], ['CS360', 'Мобайл хөгжүүлэлт', 3],
    ['CS410', 'Том өгөгдөл', 3], ['CS420', 'Компьютерийн хараа', 3],
    ['IT101', 'Мэдээллийн технологийн үндэс', 2], ['IT110', 'Компьютерийн архитектур', 3],
    ['IT120', 'Сүлжээний удирдлага', 3], ['IT130', 'Мэдээллийн систем', 3],
    ['IT210', 'Өгөгдлийн сангийн удирдлага', 3], ['IT220', 'Системийн шинжилгээ', 3],
    ['IT230', 'Проектийн удирдлага', 3], ['IT240', 'Хүний нөөцийн систем', 2],
    ['IT310', 'Бизнес аналитик', 3], ['IT320', 'ERP систем', 3],
    ['IT330', 'Data Warehouse', 3], ['IT410', 'IT стратеги', 3],
    ['MA101', 'Математик анализ I', 4], ['MA102', 'Математик анализ II', 4],
    ['MA201', 'Шугаман алгебр', 3], ['MA202', 'Дискрет математик', 3],
    ['MA210', 'Магадлал ба статистик', 3], ['MA301', 'Тоон арга', 3],
    ['MA310', 'Оновчлолын онол', 3], ['MA401', 'Дифференциал тэгшитгэл', 4],
    ['PH101', 'Механик', 4], ['PH102', 'Цахилгаан соронзон', 4],
    ['PH201', 'Термодинамик', 3], ['PH202', 'Квант механик', 4],
    ['PH301', 'Оптик', 3], ['PH310', 'Атомын физик', 3],
    ['EC101', 'Микро эдийн засаг', 3], ['EC102', 'Макро эдийн засаг', 3],
    ['EC201', 'Санхүү', 3], ['EC202', 'Нягтлан бодох бүртгэл', 3],
    ['EC301', 'Олон улсын эдийн засаг', 3], ['EC310', 'Эконометрик', 3],
    ['MG101', 'Менежментийн үндэс', 3], ['MG201', 'Маркетинг', 3],
    ['MG202', 'Байгууллагын зан төлөв', 3], ['MG301', 'Стратегийн менежмент', 3],
    ['LN101', 'Англи хэл I', 3], ['LN102', 'Англи хэл II', 3],
    ['LN201', 'Монгол хэл шинжлэл', 3], ['LN202', 'Орчуулгын онол', 3],
    ['LW101', 'Хуулийн үндэс', 3], ['LW201', 'Иргэний хууль', 4],
    ['LW202', 'Эрүүгийн хууль', 4], ['LW301', 'Олон улсын хууль', 3],
  ]
  const courseIdsWithDept: { id: number; dept: number; cap: number }[] = []
  courseCatalog.forEach(([code, title, credits]) => {
    const prefix = code.slice(0, 2)
    const deptMap: Record<string, number> = {
      CS: 2, IT: 1, MA: 3, PH: 4, EC: 5, MG: 6, LN: 7, LW: 8,
    }
    const deptId = deptMap[prefix] ?? 1
    // Тухайн тэнхимийн багш нарыг сонгоно
    const instId = rng.int(1, 50)
    const capacity = rng.pick([25, 30, 35, 40, 50, 60])
    courseIdsWithDept.push({ id: out.push(`INSERT INTO courses (code, title, department_id, instructor_id, credits, capacity) VALUES (${q(code)}, ${q(title)}, ${deptId}, ${instId}, ${credits}, ${capacity});`) - 0, dept: deptId, cap: capacity })
  })
  // course id-г 1-ээс эхлэн дахин тооцно (INSERT дарааллаар)
  courseIdsWithDept.forEach((c, i) => {
    c.id = i + 1
  })

  out.push('\n-- enrollments: ~1300 мөр')
  const semesters = ['2023-1', '2023-2', '2024-1', '2024-2', '2025-1']
  const grades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W']
  const enrollLines: string[] = []
  let enrollCount = 0
  const seen = new Set<string>()

  for (let sid = 1; sid <= 320; sid++) {
    const nCourses = rng.weighted([
      { value: 2, weight: 12 }, { value: 3, weight: 22 }, { value: 4, weight: 28 },
      { value: 5, weight: 22 }, { value: 6, weight: 16 },
    ])
    const chosen = new Set<number>()
    while (chosen.size < nCourses) chosen.add(rng.int(1, 60))

    for (const cid of chosen) {
      const sem = rng.pick(semesters)
      const key = `${sid}-${cid}-${sem}`
      if (seen.has(key)) continue
      seen.add(key)

      // 2025-1 бол одоогийн семестр — зарим нь дүн гараагүй
      const isCurrent = sem === '2025-1'
      const grade = isCurrent && rng.chance(0.4)
        ? null
        : rng.weighted([
            { value: 'A', weight: 12 }, { value: 'A-', weight: 12 },
            { value: 'B+', weight: 14 }, { value: 'B', weight: 16 },
            { value: 'B-', weight: 12 }, { value: 'C+', weight: 10 },
            { value: 'C', weight: 9 }, { value: 'C-', weight: 6 },
            { value: 'D', weight: 4 }, { value: 'F', weight: 3 }, { value: 'W', weight: 2 },
          ])
      const enrollDate = rng.dateBetween(new Date('2023-08-15'), new Date('2025-02-15'))

      enrollLines.push(
        `INSERT INTO enrollments (student_id, course_id, semester, grade, enrolled_on) VALUES (${sid}, ${cid}, ${q(sem)}, ${grade ? q(grade) : 'NULL'}, ${q(isoDate(enrollDate))});`,
      )
      enrollCount++
    }
  }

  out.push(...enrollLines)
  out.push(`\n-- Нийт ${8 + 50 + 320 + 60 + enrollCount} мөр оруулсан`)
  void grades
  return out.join('\n')
}

export const universityDomain: DomainDefinition = {
  id: 'university',
  label: 'Их сургууль',
  weeks: [2, 3, 4, 5, 7, 9, 10, 11, 12, 14],
  description:
    'Их сургуулийн бүртгэл: оюутан, хичээл, багш, тэнхим. Associative entity (enrollments) болон composite key-ийг харуулна.',
  ddl: DDL,
  seed: generateSeed(),
  examples: [
    {
      title: 'Өндөр GPA-тай оюутан',
      week: 5,
      sql: `SELECT student_id, first_name, last_name, gpa, enrollment_year
FROM students
WHERE gpa >= 3.5 AND is_active = TRUE
ORDER BY gpa DESC, last_name
LIMIT 15;`,
      explanation:
        'Хоёр нөхцөл AND-оор холбогдсон. Олон баганаар эрэмбэлэхэд эхний багана давамгайлна, дараагийнх нь тэнцсэн үед л ажиллана.',
    },
    {
      title: 'Хичээл бүрийн бүртгэлийн тоо',
      week: 7,
      sql: `SELECT c.code, c.title, c.capacity,
       COUNT(e.student_id) AS enrolled,
       ROUND(COUNT(e.student_id) * 100.0 / c.capacity, 1) AS fill_pct
FROM courses c
LEFT JOIN enrollments e ON c.course_id = e.course_id
GROUP BY c.course_id, c.code, c.title, c.capacity
HAVING COUNT(e.student_id) > 0
ORDER BY fill_pct DESC
LIMIT 20;`,
      explanation:
        'LEFT JOIN + GROUP BY нь бүртгэлгүй хичээлийг ч харуулна (0 утгатай). `fill_pct` нь дүүргэлтийн хувь — бодит их сургуульд маш чухал хэмжүүр.',
    },
    {
      title: 'Оюутан бүрийн дундаж дүн',
      week: 7,
      sql: `SELECT s.first_name, s.last_name,
       COUNT(*) AS courses_taken,
       COUNT(e.grade) AS graded,
       ROUND(AVG(CASE e.grade
         WHEN 'A' THEN 4.0 WHEN 'A-' THEN 3.7 WHEN 'B+' THEN 3.3
         WHEN 'B' THEN 3.0 WHEN 'B-' THEN 2.7 WHEN 'C+' THEN 2.3
         WHEN 'C' THEN 2.0 WHEN 'C-' THEN 1.7 WHEN 'D' THEN 1.0
         WHEN 'F' THEN 0.0 END), 2) AS computed_gpa
FROM students s
JOIN enrollments e ON s.student_id = e.student_id
WHERE e.grade IS NOT NULL
GROUP BY s.student_id, s.first_name, s.last_name
HAVING COUNT(e.grade) >= 5
ORDER BY computed_gpa DESC
LIMIT 20;`,
      explanation:
        "`CASE ... WHEN` нь үсгэн дүнг тоо болгоно. `AVG` нь NULL-ийг автоматаар алгасдаг — тиймээс `WHERE grade IS NOT NULL` нь илүүц мэт боловч илүү тодорхой. Энэ нь students.gpa баганатай таарах ёстой.",
    },
    {
      title: 'Хамгийн олон оюутантай тэнхим',
      week: 9,
      sql: `SELECT dep.name AS department,
       COUNT(DISTINCT s.student_id) AS students,
       COUNT(DISTINCT i.instructor_id) AS instructors
FROM departments dep
LEFT JOIN students s ON dep.department_id = s.department_id
LEFT JOIN instructors i ON dep.department_id = i.department_id
GROUP BY dep.department_id, dep.name
ORDER BY students DESC;`,
      explanation:
        '⚠️ Анхаар: хоёр LEFT JOIN-ийг зэрэг хийхэд бүтээгдэхүүн (cartesian) үүснэ — 320 оюутан × 50 багш. Тиймээс `COUNT(DISTINCT ...)` заавал хэрэгтэй. Энэ бол маш түгээмэл алдаа.',
    },
    {
      title: 'Ямар ч хичээл аваагүй оюутан',
      week: 9,
      sql: `SELECT s.student_id, s.first_name, s.last_name, s.enrollment_year
FROM students s
LEFT JOIN enrollments e ON s.student_id = e.student_id
WHERE e.student_id IS NULL
ORDER BY s.enrollment_year, s.last_name;`,
      explanation:
        'Anti-join — бүртгэлгүй оюутнууд. Шинэ элссэн оюутан эсвэл бүртгэлээ хийгээгүй хүн байж болно.',
    },
    {
      title: 'Хамгийн хүнд хичээл (хамгийн олон F)',
      week: 10,
      sql: `SELECT c.code, c.title,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE e.grade = 'F') AS fails,
       ROUND(COUNT(*) FILTER (WHERE e.grade = 'F') * 100.0 / COUNT(*), 1) AS fail_pct
FROM courses c
JOIN enrollments e ON c.course_id = e.course_id
WHERE e.grade IS NOT NULL
GROUP BY c.course_id, c.code, c.title
HAVING COUNT(*) >= 15
ORDER BY fail_pct DESC
LIMIT 10;`,
      explanation:
        '`FILTER (WHERE ...)` + HAVING-ийн хослол. `COUNT(*) >= 15` гэсэн нөхцөл нь цөөн оюутантай хичээлийг хасаж, статистик найдвартай байлгана.',
    },
    {
      title: 'Дундажаас өндөр GPA-тай оюутан (subquery)',
      week: 10,
      sql: `SELECT first_name, last_name, gpa
FROM students
WHERE gpa > (SELECT AVG(gpa) FROM students WHERE is_active = TRUE)
  AND is_active = TRUE
ORDER BY gpa DESC;`,
      explanation:
        'Scalar subquery. Дундаж нь `is_active` оюутнуудаар л бодогдож байгааг анхаар — subquery доторх WHERE нь гадаад query-гээс тусдаа.',
    },
    {
      title: 'Тэнхим бүрийн шилдэг оюутан',
      week: 10,
      sql: `SELECT dep.name AS department, s.first_name, s.last_name, s.gpa
FROM students s
JOIN departments dep ON s.department_id = dep.department_id
WHERE s.gpa = (
  SELECT MAX(s2.gpa) FROM students s2
  WHERE s2.department_id = s.department_id AND s2.is_active = TRUE
)
ORDER BY s.gpa DESC;`,
      explanation:
        'Correlated subquery — дотоод query нь гадаад query-гийн `s.department_id`-г ашиглаж байна. Ижил үр дүнг `RANK() OVER (PARTITION BY ...)` -аар илүү үр дүнтэй гаргаж болно.',
    },
    {
      title: 'Хичээлийн улирлын ачаалал',
      week: 7,
      sql: `SELECT e.semester,
       COUNT(DISTINCT e.student_id) AS students,
       COUNT(DISTINCT e.course_id) AS courses,
       COUNT(*) AS enrollments
FROM enrollments e
GROUP BY e.semester
ORDER BY e.semester;`,
      explanation:
        'Нэг query-д олон `COUNT(DISTINCT)` — оюутан, хичээл, нийт бүртгэлийг зэрэг харна. `COUNT(*)` нь хамгийн их утгатай байх ёстой.',
    },
    {
      title: 'Оюутан, хичээл, багш (олон JOIN)',
      week: 9,
      sql: `SELECT s.first_name || ' ' || s.last_name AS student,
       c.code, c.title AS course,
       i.first_name || ' ' || i.last_name AS instructor,
       e.grade, e.semester
FROM enrollments e
JOIN students s ON e.student_id = s.student_id
JOIN courses c ON e.course_id = c.course_id
LEFT JOIN instructors i ON c.instructor_id = i.instructor_id
WHERE e.semester = '2024-2' AND e.grade IN ('A', 'A-')
ORDER BY s.last_name, c.code
LIMIT 25;`,
      explanation:
        '`LEFT JOIN instructors` — зарим хичээлд багш томилогдоогүй байж болно. `IN (\'A\', \'A-\')` нь хоёр утгын аль нэгийг л авна.',
    },
    {
      title: 'Хамгийн их хичээл заасан багш',
      week: 10,
      sql: `SELECT i.first_name, i.last_name, i.title, dep.name AS department,
       COUNT(DISTINCT c.course_id) AS courses,
       COUNT(DISTINCT c.department_id) AS departments_taught
FROM instructors i
JOIN departments dep ON i.department_id = dep.department_id
LEFT JOIN courses c ON i.instructor_id = c.instructor_id
GROUP BY i.instructor_id, i.first_name, i.last_name, i.title, dep.name
ORDER BY courses DESC
LIMIT 10;`,
      explanation:
        '`COUNT(DISTINCT c.department_id)` нь олон тэнхимд хичээл заадаг багшийг олно — сонирхолтой шинжилгээ. LEFT JOIN ашигласан тул хичээлгүй багш ч гарна (0).',
    },
    {
      title: 'View — оюутны дүнгийн хураангуй',
      week: 12,
      sql: `CREATE VIEW student_transcript AS
SELECT s.student_id,
       s.first_name || ' ' || s.last_name AS student,
       dep.name AS department,
       c.code, c.title AS course, c.credits,
       e.semester, e.grade
FROM enrollments e
JOIN students s ON e.student_id = s.student_id
JOIN courses c ON e.course_id = c.course_id
JOIN departments dep ON s.department_id = dep.department_id
WHERE e.grade IS NOT NULL;

-- Ашиглах: нэг оюутны бүрэн дүнгийн хуудас
SELECT course, credits, semester, grade
FROM student_transcript
WHERE student_id = 42
ORDER BY semester, course;`,
      explanation:
        'VIEW нь нарийн JOIN-г нууна. Оюутан бүрийн "transcript" хуудас ийм view дээр суурилдаг — дахин дахин JOIN бичих шаардлагагүй.',
    },
    {
      title: 'Оюутны улирлын явц (window function)',
      week: 12,
      sql: `SELECT s.last_name, e.semester,
       ROUND(AVG(CASE e.grade WHEN 'A' THEN 4.0 WHEN 'B' THEN 3.0
                              WHEN 'C' THEN 2.0 WHEN 'D' THEN 1.0
                              WHEN 'F' THEN 0.0 ELSE NULL END), 2) AS semester_gpa,
       COUNT(*) AS courses
FROM students s
JOIN enrollments e ON s.student_id = e.student_id
WHERE e.grade IS NOT NULL AND s.student_id <= 20
GROUP BY s.student_id, s.last_name, e.semester
ORDER BY s.last_name, e.semester;`,
      explanation:
        'Оюутан бүрийн улирал тус бүрийн GPA. Бодит их сургуулийн системд ийм query-г оюутны дэлгэрэнгүй хуудсанд ашигладаг.',
    },
    {
      title: 'Хичээлийн шаардлага шалгах (capacity)',
      week: 4,
      sql: `SELECT c.code, c.title, c.capacity,
       COUNT(e.student_id) AS enrolled,
       c.capacity - COUNT(e.student_id) AS seats_left
FROM courses c
LEFT JOIN enrollments e ON c.course_id = e.course_id
GROUP BY c.course_id, c.code, c.title, c.capacity
HAVING COUNT(e.student_id) >= c.capacity
ORDER BY seats_left;`,
      explanation:
        'Capacity-г хэтрүүлсэн хичээлүүдийг олно. `HAVING COUNT(...) >= c.capacity` нь aggregate болон энгийн баганыг хослуулсан — энэ нь зөвхөн GROUP BY-д орсон баганад л боломжтой.',
    },
    {
      title: 'CHECK constraint — буруу дүн',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- АЛДАА: 'X' нь зөвшөөрөгдсөн дүн биш
INSERT INTO enrollments (student_id, course_id, semester, grade, enrolled_on)
VALUES (1, 1, '2025-2', 'X', CURRENT_DATE);`,
      explanation:
        "`CHECK (grade IN (...))` нь зөвхөн зөв дүн оруулахыг баталгаажуулна. Мөн composite PRIMARY KEY нь ижил оюутан нэг хичээлийг нэг улиралд хоёр удаа авахаас сэргийлнэ.",
    },
  ],
  challenges: [
    {
      id: 'uni-1',
      title: 'Онцгой сайн оюутан',
      task: 'GPA нь 3.8-аас дээш, идэвхтэй оюутнуудын нэр болон GPA-г гарга. GPA-аар буурах дарааллаар.',
      expectedColumns: ['first_name', 'last_name', 'gpa'],
      hint: 'WHERE gpa > 3.8 AND is_active = TRUE ORDER BY gpa DESC',
      solution:
        'SELECT first_name, last_name, gpa FROM students WHERE gpa > 3.8 AND is_active = TRUE ORDER BY gpa DESC;',
    },
    {
      id: 'uni-2',
      title: 'Элсэлтийн оны тоо',
      task: 'Элсэлтийн он тус бүрээр оюутны тоог гарга. Багана: enrollment_year, student_count.',
      expectedColumns: ['enrollment_year', 'student_count'],
      hint: 'GROUP BY enrollment_year',
      solution:
        'SELECT enrollment_year, COUNT(*) AS student_count FROM students GROUP BY enrollment_year ORDER BY enrollment_year;',
    },
    {
      id: 'uni-3',
      title: 'Профессорууд',
      task: '`title` нь "Профессор" багш нарын нэр, и-мэйлийг гарга.',
      expectedColumns: ['first_name', 'last_name', 'email'],
      hint: "WHERE title = 'Профессор'",
      solution: "SELECT first_name, last_name, email FROM instructors WHERE title = 'Профессор';",
    },
    {
      id: 'uni-4',
      title: 'Хамгийн их кредит',
      task: 'Хамгийн их кредиттэй хичээлийн код, нэр, кредитийг гарга.',
      expectedColumns: ['code', 'title', 'credits'],
      hint: 'ORDER BY credits DESC LIMIT 1',
      solution: 'SELECT code, title, credits FROM courses ORDER BY credits DESC LIMIT 1;',
    },
    {
      id: 'uni-5',
      title: 'Олон хичээл авсан оюутан',
      task: '5-аас дээш хичээл авсан оюутны нэр болон хичээлийн тоог гарга.',
      expectedColumns: ['first_name', 'last_name', 'course_count'],
      hint: 'JOIN students → enrollments, GROUP BY, HAVING COUNT(*) > 5',
      solution: `SELECT s.first_name, s.last_name, COUNT(*) AS course_count
FROM students s JOIN enrollments e ON s.student_id = e.student_id
GROUP BY s.student_id, s.first_name, s.last_name
HAVING COUNT(*) > 5 ORDER BY course_count DESC;`,
    },
  ],
}
