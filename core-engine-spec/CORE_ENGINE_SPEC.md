# MOLOKH Core Engine Specification

**Версия:** 1.0  
**Дата:** 2 сентября 2026  
**Статус:** зафиксированная каноническая спецификация Core Engine для MVP  
**Язык домена:** имена типов и событий — English; объяснения и продуктовые правила — Russian.

## 1. Назначение и границы

Core Engine организует реальную совместную спортивную активность и прозрачную локальную конкуренцию. Он отвечает за:

- Social-контур: `Discovery → Like → Match → Chat`;
- организационный контур: `Proposal → Slot → Booking → Session`;
- соревновательный контур: `Challenge → Result → Appeal → Status`;
- Membership, роли, Youth/Adult, FIFO, GENESIS, Succession, Safety и аудит.

Core Engine не определяет спортивные правила, не оценивает силу спортсмена, не строит Elo/MMR, не ранжирует №2/№3 и не выполняет платежи в MVP. Счёт, метод и ruleset — описательный контекст Session; на Status Engine влияет только формальный исход.

## 2. Приоритет источников

При конфликте используется следующий порядок:

1. подтверждённые ответы владельца продукта, сведённые в `MOLOKH_MOBILE_UX_CORE_HANDOFF_v0.2.md`;
2. этот комплект `core-engine-spec`;
3. `Molokh_MVP_Developer_Spec_v1_0.docx`;
4. `MOLOKH Core Engine Specification.pdf`;
5. `Molokh MVP User Experience Map.pdf`.

Поздний handoff является продуктовым каноном. Эта спецификация формализует его, не меняя философию. Неразрешённые продуктовые решения вынесены в [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md); принятые инженерные допущения отмечены `ASSUMPTION`.

## 3. Нормативные термины

- **MUST / НУЖНО** — обязательное правило.
- **MUST NOT / НЕЛЬЗЯ** — запрещённое поведение.
- **SHOULD** — рекомендуемое поведение, отклонение требует причины.
- **MAY** — разрешённый вариант.
- **Terminal** — из состояния нет обычного бизнес-перехода; исправление возможно только компенсирующим событием Central.
- **Official Challenge** — соревновательное намерение; не является физической Session.
- **Session** — фактическая тренировка с Coach; соревновательность задаётся связанным Challenge и snapshot на старте.
- **№1 / Champion** — одна и та же роль `CHAMPION`.
- **Contender** — единственный текущий претендент Competition.
- **Ordinary** — ACTIVE участник без позиции Champion/Contender.
- **Competition** — независимый статусный контур `(community, age_division)`; дисциплина зарезервирована для будущего.
- **Status-bearing Challenge** — Session, где на старте поставлен на кон Champion или Contender.

## 4. Неизменяемые продуктовые принципы

1. Like не является Challenge; Match не является обязательством.
2. Кто угодно может хотеть тренироваться с кем угодно внутри разрешённого возрастного контура; предпочтения меняют порядок, а не право.
3. Обычное приглашение можно отклонить без поражения.
4. После принятия Official Challenge появляется обязательство найти Slot; после `BOOKING_CONFIRMED` односторонняя отмена Athlete создаёт Forfeit, если нет внешней причины.
5. Coach обязателен для каждой персональной Session и является арбитром факта присутствия/исхода.
6. Athlete не выполняет Check-in и не подтверждает Result.
7. Статус меняется только из формального Result или отдельного Succession/Genesis/administrative event.
8. Очередь к Contender — строгий FIFO без скрытых привилегий.
9. Result применяется при `RECORDED`, но статус остаётся provisional до завершения/отказа от Appeal.
10. BLOCK, Unmatch и удаление чата не отменяют принятого обязательства; до acceptance они закрывают только Match-based optional процессы, но не статусный FIFO/mandatory path.
11. Обычная Training Session не создаёт поражение, Cooldown или статусный эффект.
12. Сложность Engine скрыта: Athlete всегда получает один понятный следующий action и конкретное последствие.
13. `scheduled_start_at` открывает Session window и фиксирует stakes, но не доказывает физическое проведение; actual start/attendance подтверждает только Coach, без Athlete Check-in.

## 5. Рекомендуемая архитектура MVP

### 5.1. Форма системы

`ASSUMPTION A-01`: модульный монолит с PostgreSQL, фоновой очередью заданий и transactional outbox. Это минимизирует распределённые гонки при Booking/Status и оставляет границы для последующего выделения сервисов.

Модули:

| Модуль | Ответственность | Главные aggregate roots |
|---|---|---|
| Identity | аккаунт, телефон, возраст, verification/recovery/duplicates | `User`, `AccountVerification`, `AccountAccessCase`, `DuplicateAccountCase` |
| Social | Like, Match, Chat, Block, Discovery signals | `Like`, `Match`, `Block` |
| Community | Venue, Community, Membership, роли | `Community`, `CommunityMembership`, `RoleGrant` |
| Scheduling | Slot, Booking, Group Plan | `Slot`, `Booking`, `GroupPlan` |
| Session | физическая активность, attendance | `Session` |
| Competition | Challenge, FIFO, GENESIS, status projection | `Competition`, `Challenge`, `ChallengeQueueEntry` |
| Results | Result, Appeal, technical correction | `Result`, `Appeal` |
| Governance | Report, Safety, removal, restriction | `ModerationCase`, `Enforcement` |
| Platform | timers, configuration, audit, notifications | `SystemConfiguration`, `AuditEvent`, `OutboxMessage` |

Модули общаются командами и immutable domain events. Синхронные проверки, меняющие несколько ресурсов, выполняются в одной БД-транзакции. Push/email не входят в транзакцию: событие сначала попадает в outbox.

### 5.2. Status как event-backed projection

Текущие `champion_user_id` и `contender_user_id` — проекция, а не единственная истина. Источник истории:

- immutable `ResultRecorded` и решения Appeal;
- `StatusTransitionApplied` / `StatusTransitionCompensated`;
- GENESIS, Succession, resignation, age transition и enforcement events;
- `StatusTenure` с `started_by_event_id` и `ended_by_event_id`.

Полное event sourcing всей системы не требуется. Для Competition event journal обязателен; остальным модулям достаточно транзакционных таблиц плюс audit/outbox.

### 5.3. Командный контракт

Каждая изменяющая команда содержит:

```text
command_id       UUIDv7
idempotency_key  string, уникальный в (actor, command_type)
actor_id         UUIDv7 | SYSTEM
actor_roles      snapshot
aggregate_id     UUIDv7
expected_version integer
occurred_at      server UTC
payload          versioned object
```

Успешная повторная команда с тем же ключом возвращает прежний результат. Тот же ключ с другим payload отклоняется как `IDEMPOTENCY_KEY_REUSED`.

### 5.4. Время и дедлайны

- Все timestamps хранятся в UTC; Venue хранит IANA timezone.
- Дедлайн считается по server time, не по времени устройства.
- Интервалы полуоткрытые: `[start_at, end_at)`.
- Scheduler обрабатывает timeout идемпотентно и проверяет `aggregate_version` и ожидаемое состояние.
- `ProcessHold` хранит `started_at`; при release deadline продлевается на фактическую длительность hold, если политика данного clock — `PAUSABLE`.
- Cooldown clock — `CONTINUOUS`: Community pause его не останавливает.

## 6. Канонические контуры

### 6.1. Social

- Discovery hard gates: User active и не paused, тот же YOUTH/ADULT contour, не self, нет effective Block/suppression и нет active/archived Match пары.
- Внутри города используется стабильный tiered order: входящий Like; кандидаты внутри radius; пересечение предпочтений/видов спорта и веса; расстояние Home Venue; недавняя активность и скорость ответа. После исчерпания radius включаются остальные кандидаты города.
- Точные числовые веса — versioned ranking configuration. Они не могут превратить спорт/вес в eligibility gate или создать скрытый reliability score.
- Like создаётся только из Discovery, истекает через 30 дней.
- Входящий Like влияет на приоритет и оформление карточки, но не открывает отдельный список.
- Mutual Like атомарно создаёт один Match на нормализованную пару.
- SKIP удаляет входящий Like и скрывает пару на 15 дней.
- Match архивируется после 30 дней без активности; сообщение восстанавливает его.
- Unmatch закрывает чат и скрывает пару на 15 дней. До accepted obligation он no-fault закрывает Match-based optional Challenge, незавершённый Group Plan и Slot request; уже принятое обязательство сохраняется. Статусная FIFO-заявка/mandatory path не исчезает: взаимодействие переводится в минимальный service-only UI, чтобы Block/Unmatch нельзя было использовать для уклонения от конкуренции.
- Youth и Adult полностью разделены.
- BLOCK закрывает личный контакт. До acceptance он применяет ту же no-fault очистку необязательных social intents, что и Unmatch; после acceptance оставляет только структурированные служебные действия Challenge. Safety-причина оформляется отдельным Report/Case.
- `display_name` — свободное публичное самоназвание Athlete, а не legal identity. Оно меняется сразу без Central pre-approval и повторной верификации; badge/history привязаны к стабильному `user_id`, прежние имена видит только Central audit. Avatar проходит автоматическую проверку, а опасное/незаконное имя рассматривается только через Report/Safety.
- Personal message можно редактировать 15 минут с видимой отметкой и append-only revisions; service/action messages неизменяемы. «Удалить у себя» влияет только на собственную проекцию. Report замораживает исходный текст и revisions как Case evidence; скрыть сообщение для всех может только Central по решению Case.
- Потеря устройства/SIM или смена телефона не снимает обязательства. Recovery использует verified phone или Central signals без хранения identity documents. После phone change чувствительные действия закрыты на 24h, но старая authenticated session может выполнять только нужные service responses; подтверждённый access incident допускает scoped no-fault deadline review.
- Duplicate accounts не merge автоматически. Central выбирает canonical User, ограничивает duplicate, связывает immutable histories private alias relation и отдельно решает каждый active obligation/status через Case; простое объединение никогда не переносит титул.

### 6.2. Training и Group Plan

- Персональная тренировка требует Match, двух Athlete, одного Coach и одного Venue Slot.
- Slot виден обоим; выбор одной стороны хранится 1 час.
- Slot не резервируется до финального подтверждения Coach/Gym Admin/принимающего Venue.
- Финальный confirm атомарно блокирует Slot и связанные ресурсы.
- После confirmation Gym Admin может заменить Coach без нового mutual confirm только на authorized non-conflicted Coach при неизменных Venue/time/price/ruleset. Обязательное уведомление даёт Athlete простое право запросить external no-fault reschedule; любое изменение material terms требует нового подтверждения.
- В `scheduled_start_at` Engine открывает `READY_FOR_COACH` и фиксирует immutable competition snapshot. Фактический `IN_PROGRESS` создаёт Coach командой Start либо первой Attendance. Если Coach/Venue не обеспечил проведение, equivalent Coach может заменить его в пределах grace; иначе Session/Booking закрываются external no-fault, а Official Challenge возвращается к scheduling без user reschedule count.
- Обычная отмена не создаёт Competition effects; парный Booking можно явно сохранить как solo после согласия оставшегося Athlete и Coach/venue.
- Уже confirmed парную Training Session можно до старта явно преобразовать в Official Challenge после подтверждения обоих Athlete и назначенного Coach, полной eligibility-проверки и Youth consent. При отказе/expiry она остаётся обычной Training без штрафа. Конверсия с участием Contender не обходит FIFO: сначала создаётся обычная queue entry; если очередь не дошла до неё до старта, Training остаётся обычной.
- Group schedule публикуется Gym Admin вручную как `GroupOffering`: UI показывает `last_updated_at`, контакты и предупреждение уточнить места; начало автоматически скрывает просроченную запись. Molokh не гарантирует capacity/freshness.
- Group Plan требует взаимного подтверждения, лишь уведомляет зал и показывает immutable offering/contact snapshot; он не Booking, Session или статистика.
- Group Plan может стать Official Challenge до начала после подтверждения обоих Athlete и Coach.

### 6.3. Official Challenge eligibility

| Инициатор → адресат | Нужен Match | Response policy | Возможные stakes на старте |
|---|---:|---|---|
| Ordinary → Ordinary | да | optional | NONE |
| Champion → Ordinary | да | optional | NONE |
| Ordinary → Champion | не разрешено как Official | — | — |
| Ordinary → Contender | нет; вход из Community | mandatory для Contender | CONTENDER |
| Champion → Contender | нет; через FIFO | optional для Contender | TITLE |
| Contender → Champion | нет; через FIFO | mandatory для Champion | TITLE |
| Contender → Ordinary | не разрешено в MVP | — | — |
| GENESIS pair | нет | взаимное принятие | GENESIS_CHAMPION или GENESIS_CONTENDER |

На `Create`, `Accept`, `BookingConfirm` и `SessionWindowOpen` повторно проверяются Membership, age division, verification, Safety, Community availability, Cooldown и статусные ограничения. BLOCK является hard gate для Social/Match-based optional пути, но не для статусного FIFO/mandatory пути: там он только ограничивает контакт structured service UI. На `SessionWindowOpen` Engine фиксирует роли и stakes в единственном authoritative snapshot; последующий Coach Start подтверждает физическое начало, но не пересчитывает stakes.

Один Athlete может иметь максимум один accepted, ещё не завершённый Official obligation. Pending optional invitations и WAITING FIFO entries лимит не занимают. При попытке активации занятого Athlete его FIFO entry инвалидируется без потери/штрафа и может быть создан заново после освобождения; это не позволяет блокировать status slot. Ordinary Training разрешены параллельно только без пересечения времени. Уже confirmed Challenge не отменяется из-за последующей смены статуса.

На Athlete допускается максимум три исходящих unanswered OPTIONAL Challenge и один на pair. Explicit decline запускает 48h pair quiet period; обычный expiry уже завершает 48h ожидания и допускает новый invite сразу. Эти limits не применяются к FIFO/mandatory/status paths и не создают reliability signal.

Challenge creation фиксирует immutable ruleset/version snapshot и acknowledgment инициатора; acceptance добавляет acknowledgment получателя (в mutual GENESIS — каждого при его действии). По умолчанию acknowledgment входит в соответствующий create/accept command; отдельный checkbox показывается только для Central-approved ruleset с `EXPLICIT_ACK_REQUIRED`. Последующая смена ruleset действует только на новые obligations и никогда не меняет status algebra.

### 6.4. Scheduling

- После acceptance Session должна состояться за 14 дней.
- Система сначала расширяет Venue/Coach и предлагает Group Plan; затем допускает одно +7-дневное extension.
- Нет доступности после extension — `CANCELLED_NO_FAULT`.
- На Challenge максимум два пользовательских reschedule. Mutual reschedule расходует один общий перенос без виновника.
- Следующая виновная попытка после исчерпания лимита создаёт Forfeit.
- Coach/Venue/force majeure не расходуют пользовательский лимит.
- Athlete cancel после confirmed official Booking создаёт Result FORFEIT и стандартное 48-часовое окно Appeal.

### 6.5. Result и Appeal

Допустимые outcomes: `WIN_A`, `WIN_B`, `DRAW`, `NO_CONTEST`, `FORFEIT`, `NO_SHOW`. Для последних трёх обязательны reason/comment. Coach записывает исход; Coach-участник собственной Session не может быть арбитром. Опоздание отмечается `LATE`, но если Session состоялась, исход остаётся обычным Result. `NO_SHOW` допустим только после Venue grace, когда отсутствие Athlete объективно сорвало Session; отсутствие обоих нормализуется в `NO_CONTEST`.

После actual start injury или добровольный отказ продолжать интерпретируются Coach по frozen ruleset и могут дать обычный decisive Result; медицинские документы Molokh не собирает. `NO_CONTEST`/no-fault применяется только при внешней Safety/Venue/equipment невозможности. До actual start действуют обычные reschedule/cancellation rules.

`RECORDED` немедленно обновляет provisional status и запускает 48 часов Appeal. Участники затронутого status transition не могут начать следующую status-bearing Session до `FINAL`/waiver. Описательные поля можно исправить Coach в течение 24 часов; winner/outcome — только через Central correction или Appeal.

Provisional Result/status виден сразу с нейтральной публичной меткой. После final метка исчезает; reversal перестраивает public stats/last-five по effective outcome, сохраняя в Competition history только нейтральный факт пересмотра без закрытого evidence.

После final обычный Appeal не переоткрывается. Только Central может завести независимый `IntegrityCase` для доказуемого fraud, system error или identity error. Source Result/event/history не изменяются и не удаляются; correction/annul/repeat идут через compensating events, Competition hold и deterministic replay, с публичной reason category без раскрытия Case evidence.

Если назначенный Coach не записал Result: reminder идёт через 2h, Gym Admin escalation через 12h, а через 24h открывается `MissingResultReview`. Central собирает раздельные statements обоих Athlete и Venue attendance evidence, но не назначает winner. При совпадающих данных результат подтверждает другой авторизованный reviewer-Coach; при споре/недостатке данных назначается no-fault repeat, а при объективной невозможности repeat reviewer-Coach фиксирует `NO_CONTEST`. Бездействие исходного Coach рассматривается отдельно от спортивного результата.

### 6.6. Status outcomes

| Session-start snapshot | Effective outcome | Status effect |
|---|---|---|
| Ordinary vs Ordinary / Champion vs Ordinary | любой | нет |
| Contender vs Ordinary | Ordinary wins, включая Forfeit/NO_SHOW соперника | Ordinary становится Contender; прежний Contender — Ordinary |
| Contender vs Ordinary | Contender wins / DRAW / NO_CONTEST | без изменения |
| TITLE Champion vs Contender | Contender wins, включая Champion Forfeit/NO_SHOW | swap: Contender → Champion, Champion → Contender |
| TITLE Champion vs Contender | Champion wins / DRAW / NO_CONTEST | без изменения |
| Founding GENESIS | обычная победа | winner → Champion, loser → Contender |
| Founding GENESIS | loser loses by FORFEIT/NO_SHOW | winner → Champion, Contender vacant |
| Contender GENESIS | определён winner | winner → Contender |
| Любой status context | DRAW/NO_CONTEST | без status transition |

Cooldown пары 15 дней начинается при `RECORDED` для подтверждённого поражения и удаляется компенсирующим событием при annul/repeat. DRAW/NO_CONTEST Cooldown не создают.

### 6.7. Public profile statistics

- Публично: current Champion/Contender, status tenure history, Official W/L/D, последние пять effective Official Results, FORFEIT/NO_SHOW в нейтральной формулировке и общее число completed attended Training. Их учёт как effective win/loss при этом не меняется.
- Не публикуются: win rate, reliability score, Safety/administrative reasons, Coach comments, имена/даты обычных Training partners.
- Владелец видит расширенную собственную историю. Training и Competition остаются раздельными projections.

## 7. FIFO, GENESIS и Succession

### 7.1. FIFO

`ASSUMPTION A-02`: полный порядок определяется `(submitted_at_server, entry_id)`, где `entry_id` — UUIDv7. Это разрешает одинаковые timestamps без выбора владельцем статуса. В тот же порядок входят prebooked Training/Group conversion intents, если их stakes затрагивают Contender.

Один Athlete имеет максимум одну живую заявку в очередь конкретного Contender-slot. Отзыв и повторная подача создают новый timestamp. Entry активируется только когда статусный slot свободен; именно тогда начинается 72-часовой mandatory response clock. Champion offer не получает приоритета. Contender TITLE intent также занимает обычную позицию и не обходит старые входящие заявки.

При смене Contender очередь сохраняется. Ожидающий инициатор должен за 24 часа подтвердить готовность к новому владельцу; timestamp сохраняется. Entry прежнего Contender на TITLE инвалидируется, потому что инициатор больше не имеет роли. Ранее подтверждённые Sessions нового Contender проходят первыми по `start_at`.

Полный FIFO виден всем active Community members: display identity, позиция, submitted time и публичное состояние, с отдельным выделением active pair. Внешнему пользователю доступны только размер очереди и active Challenge. Причины Block/Safety/eligibility видят только соответствующий Athlete и Central; любое изменение порядка происходит через audited terminal/migration event.

### 7.2. GENESIS

- Athlete явно нажимает «Бороться за статус»; eligible заявка не имеет скрытого TTL, пока сам Athlete не отзовёт её или не потеряет eligibility.
- При обеих вакансиях первые два ACTIVE willing Athlete по FIFO получают founding GENESIS и 48 часов на взаимное принятие. Pairing ещё не является accepted obligation.
- Если один кандидат отказывается или не отвечает, его entry закрывается, а второй возвращается в голову очереди с исходным FIFO timestamp. Добровольный выход no-fault; повторный вход получает новый timestamp.
- Один кандидат после публичных 3 дней становится Champion через `GENESIS_WITHOUT_OPPONENT`; Contender остаётся vacant.
- При vacant Contender первые два кандидата проходят тот же 48-часовой mutual-acceptance flow; один кандидат после 3 дней получает позицию через `SUCCESSION_WITHOUT_OPPONENT`.
- GENESIS проходит полный Booking/Coach/Session/Result/Appeal.
- DRAW/NO_CONTEST не назначают позицию; Challenge переходит в repeat scheduling (`ASSUMPTION A-03`).

### 7.3. Succession и уход

- Champion уходит без active TITLE: Contender → Champion, Contender vacant.
- Champion уходит с active TITLE obligation: opponent получает win by Forfeit; если TITLE-смена временно назначила уходящего Champion новым Contender, последующий Membership exit немедленно освобождает Contender без дополнительного поражения.
- Contender уходит без active accepted obligation: position vacant; очередь становится GENESIS candidate list с исходным FIFO.
- Contender уходит с active obligation: opponent получает win by Forfeit и, если snapshot допускает, Contender.
- Ordinary уходит после acceptance: Forfeit; до acceptance — no-fault close.
- Двухшаговый voluntary resignation означает явный waiver Appeal.
- До accepted obligation Champion/Contender может двухшагово освободить только status, остаться active member как Ordinary и не получить loss/Cooldown. Personal/injury freeze и medical document path отсутствуют; Discovery pause не меняет obligations. После acceptance действуют обычные cancellation/Forfeit/Appeal, кроме отдельного подтверждённого Central no-fault case.
- Age 18 transition немедленно освобождает Youth status без поражения и вводит Athlete в Adult как Ordinary. Started Session завершается по frozen Youth snapshot; любая не started Youth Official закрывается no-fault, а physical Booking может пройти B-26…B-29 Training retention. Guardian consent и Youth queue завершаются; status/FIFO не переносятся.

## 8. Community, роли и Safety

- Community = один физический зал в MVP; Competition разделена на YOUTH и ADULT.
- Модель допускает много Membership, но MVP policy разрешает одну active competitive Membership на Athlete.
- QR/invite активирует Membership сразу; self-request требует Gym Admin, reminder 12h, Central escalation 24h.
- После self-request rejection новый self-request разрешён через 7d; invite/QR или явное решение Gym Admin/Central могут открыть вход раньше. Пользователь видит нейтральную reason category, внутренний Safety context закрыт; отказ не публикуется и не является punishment.
- Любой авторизованный Coach исходной Community может судить в любом подключённом принимающем Venue; Guest Coach ограничен одной Session.
- Venue имеет одного `PRIMARY_ADMIN` и несколько `GYM_ADMIN` с равными обычными operational permissions. Назначение/смена Primary, closure и security actions выполняет только Central; Slots, GroupOffering и config внутри ranges доступны каждому active Admin и полностью аудируются.
- Gym Admin может подтверждать Venue своей Session, но не Result как Athlete/Coach-участник.
- Youth Official Challenge требует отдельного consent для каждого Youth Athlete и Challenge: одноразовая web-ссылка, declared guardian name/relationship и подтверждённый e-mail либо добровольный SMS. Аккаунт/документы представителя не требуются. Отзыв до старта закрывает Official no-fault; физическую Booking можно явно сохранить как Training. Coach и Venue confirmation остаются обязательными.
- REPORT создаёт case-scoped review, а не автоматический глобальный ban.
- `REPORT_SAFETY_AND_CANCEL` снимает Booking без автоматического Forfeit, ставит Challenge на pausable hold и запускает Central SLA 24h/48h.
- Полный access restriction возможен только для подтверждённого насилия, fraud, identity forgery или illegal use; appeal 7 дней и другой reviewer.
- Community PAUSED сохраняет confirmed Sessions и необходимый для них Result/Appeal path; прочие процессы/дедлайны замораживаются; Cooldown идёт.
- Permanent Community closure выполняет только Central по versioned Closure Plan. На scheduling сразу запрещаются новые actions, pending/unconfirmed processes закрываются no-fault, а перечисленные в плане безопасные confirmed Sessions могут завершиться с полным Result/Appeal path. После их обработки status tenures закрываются `COMMUNITY_CLOSED` без W/L/Succession, Membership архивируются, history остаётся. Competition/status не мигрируют; relocation того же Venue оформляется обновлением Venue identity/address.
- Result attachment capability отсутствует. Appeal/Safety contour принимает максимум 5 image/short audio/video files общим объёмом ≤100MB; PDF/archive/office formats запрещены. Originals шифруются и доступны submitter/Central, а opponent или assigned Coach получают только case-scoped проверенное/redacted disclosure. Malware/content scan, quarantine, short-lived signed access и retention deletion обязательны.

Future multi-Community/discipline schema использует отдельный Competition scope `(community, age_division, discipline)`. Membership могут быть множественными, одна primary Community управляет Home/Discovery; status, FIFO, Cooldown и stats не переносятся между scopes. Глобальный one-accepted-Official limit сохраняется, global №1 не появляется. Feature выключен в MVP.

## 9. Конфигурация MVP

| Ключ | Default | Допустимое изменение | Clock policy |
|---|---:|---|---|
| `like_ttl` | 30d | system | continuous |
| `skip_pair_hide` | 15d | system | continuous |
| `unmatch_pair_hide` | 15d | system | continuous |
| `match_archive_after` | 30d | system | continuous |
| `membership_reapply_wait` | 7d | system; invite/QR/Admin/Central override | continuous |
| `slot_selection_ttl` | 1h | system | pausable only by platform outage |
| `slot_publish_horizon` | 30d | system | — |
| `minimum_booking_notice` | venue required; 8h recommended | venue, range 8–48h | continuous |
| `mandatory_response_ttl` | 72h | system | pausable |
| `mandatory_response_reminder` | 48h | system | pausable |
| `optional_response_ttl` | 48h | system | pausable |
| `optional_response_reminders` | 12h, 24h | system | pausable |
| `genesis_response_ttl` | 48h | system | pausable |
| `genesis_response_reminders` | 12h, 24h | system | pausable |
| `optional_outgoing_unanswered_limit` | 3 | system | — |
| `optional_decline_pair_quiet` | 48h | system | continuous |
| `challenge_scheduling_deadline` | 14d | system | pausable |
| `challenge_extension` | +7d once | system/Central exception | pausable |
| `max_user_reschedules` | 2 | system | — |
| `no_show_grace` | 15m | Gym Admin, range 5–30m | continuous |
| `appeal_window` | 48h | system | continuous unless Central/system hold |
| `appeal_response_window` | 24h | system | non-blocking |
| `appeal_sla` | 72h | extendable with reason | — |
| `coach_result_reminder` | 2h | system | continuous |
| `admin_result_escalation` | 12h | system | continuous |
| `central_result_escalation` | 24h | system | continuous |
| `coach_metadata_edit_window` | 24h | system | continuous |
| `pair_cooldown` | 15d | Gym Admin, range 7–30d | continuous |
| `queue_reconfirmation` | 24h | system | pausable |
| `conversion_confirmation_ttl` | 72h, capped by source start | system | pausable while status slot held |
| `genesis_public_window` | 3d | system | pausable |
| `safety_initial_sla` | 24h | system | — |
| `safety_final_sla` | 48h | extendable with reason | — |
| `access_restriction_appeal` | 7d | system/legal future | continuous |
| `evidence_file_count` | 5 | system | — |
| `evidence_total_size` | 100MB | system | — |
| `evidence_media_duration` | 60s/file | Central-configurable technical limit | — |
| `evidence_signed_url_ttl` | 5m | system/security | continuous |
| `phone_change_sensitive_hold` | 24h | system/security | continuous |

Ruleset, Slot publication data, Venue contacts, `minimum_booking_notice`, `no_show_grace` и `pair_cooldown` меняет Gym Admin только в Central ranges. Appeal/response/reschedule/scheduling/GENESIS/queue timers едины для MVP. Новая version configuration действует на новые Challenge/Session snapshots и публично видна до принятия обязательства.

### 9.1. Notification policy

- In-app Inbox создаётся для всех пользовательских обязательств и значимых service changes и является обязательным каналом; внутренние технические события не создают пользовательский шум.
- Push используется для Booking, Challenge, Session, Result, Appeal и Safety; social/promotional push можно отключить.
- Event-SMS по умолчанию выключен и включается пользователем добровольно как резерв обязательных уведомлений. Authentication transport рассматривается отдельно.
- Business deadline определяется server time и не зависит от delivery/read state.
- Только формальный `PlatformIncident`, подтверждённый Central по объективному окну сбоя, может компенсировать затронутые действия. Pausable deadlines продлеваются ровно на пересечение с incident window; уже сработавшие timeout/Forfeit не удаляются, а получают компенсирующее no-fault событие. Session fact, Cooldown и retention clocks не останавливаются; индивидуальной жалобы без подтверждённого Incident недостаточно.

### 9.2. Data lifecycle MVP

- Personal Chat, включая append-only revisions: 12 месяцев после последней активности; Report сохраняет зафиксированную копию в Case retention.
- Challenge service Chat и Appeal record: 3 года после terminal decision.
- Result, CompetitionEvent, StatusTenure и AuditEvent: бессрочно для целостности истории.
- Safety evidence: 3 года после закрытия Case.
- Result photo/video upload отсутствует в MVP целиком; поля/endpoint/UI не публикуются.
- Account closure: 30 дней recovery, затем public identity заменяется на «Удалённый участник»; immutable Competition/audit history сохраняется.
- User может запросить self-export. Legal policy может ужесточить сроки без изменения aggregate semantics.

## 10. Конкурентность и согласованность

1. Все aggregate roots имеют integer `version`; команды используют optimistic concurrency.
2. Booking confirm блокирует Slot и resource-calendar rows; уникальные exclusion constraints запрещают пересечения Coach/Venue.
3. На пару Athlete действует normalized `pair_key`; partial unique index запрещает более одного pending/active competitive relationship.
4. На `(competition_id, athlete_id)` действует unique live queue entry.
5. На Competition transition берётся row lock; `status_version` увеличивается на единицу.
6. На Session допускается один effective Result; повтор команды возвращает исходный Result.
7. Timer worker использует claim/lease и compare-and-set, поэтому двойной timeout не создаёт два Forfeit.
8. Каждый domain event и outbox message имеет уникальный ID; consumer хранит inbox/deduplication key.
9. Ни один внешний notification failure не откатывает успешное бизнес-событие.
10. Любой Appeal rollback выполняется компенсирующими events, никогда удалением Result/tenure/history.

Подробности: [EVENTS_AND_INVARIANTS.md](EVENTS_AND_INVARIANTS.md).

## 11. Аудит противоречий исходных документов

| ID | Ранняя формулировка | Каноническое решение | Статус |
|---|---|---|---|
| C-01 | регистрация 16+ | 14+, независимые YOUTH 14–17 и ADULT 18+ | `SUPERSEDED` |
| C-02 | дисциплина/вес — eligibility filters | только soft Discovery priorities; свобода приглашения сохраняется | `SUPERSEDED` |
| C-03 | любой Challenge без Match | Match нужен для Ordinary↔Ordinary и Champion→Ordinary; status path к Contender — без Match | `SUPERSEDED` |
| C-04 | Athlete A/B заявляют Result | Result и attendance фиксирует Coach; Athlete check-in отсутствует | `SUPERSEDED` |
| C-05 | №1 не может инициировать TITLE | Champion может предложить Contender; Contender вправе отказать без penalty | `SUPERSEDED` |
| C-06 | Contender рискует статусом только в отдельном типе | Contender рискует в каждой Official Session против Ordinary | `SUPERSEDED` |
| C-07 | simultaneous requests выбирает Contender, остальные сгорают | строгий FIFO; timestamp tie-breaker deterministic; очередь сохраняется | `SUPERSEDED` |
| C-08 | очередь адресована человеку и отменяется при смене | очередь принадлежит status slot; reconfirm 24h | `SUPERSEDED` |
| C-09 | Cooldown 7d | 15d, configurable Community | `SUPERSEDED` |
| C-10 | GENESIS — первый подтверждённый Result среди любых параллельных | первые два willing ACTIVE по FIFO; один кандидат — 3-day succession | `SUPERSEDED` |
| C-11 | vacant Contender восстанавливает любой Challenge | публичные FIFO candidates: два — GENESIS, один после 3d — succession | `SUPERSEDED` |
| C-12 | обычный выход отменяет все active challenges без loss | после accepted obligation — Forfeit; до acceptance — no-fault | `SUPERSEDED` |
| C-13 | Result сразу окончательный | provisional at RECORDED + Appeal 48h + rollback/locks | `SUPERSEDED` |
| C-14 | pause только запрещает новые события | confirmed Sessions остаются; остальные состояния и pausable clocks freeze | `SUPERSEDED` |
| C-15 | один User может активно соревноваться во многих Community уже в MVP | data model multi-community; MVP — одна active competitive Membership | `SUPERSEDED_FOR_MVP` |
| C-16 | Group class является Session/booking intent | только взаимный social plan + gym notification; не Booking/Session/stats | `SUPERSEDED` |
| C-17 | Home Venue определяет Competition | Home Venue влияет только на Discovery/Slots; Membership определяет Competition | `SUPERSEDED` |
| C-18 | статус хранится изменяемым полем Profile | immutable status events + `StatusTenure` + projection | `SUPERSEDED` |
| C-19 | SKIP скрывает пару на адаптивные 7–10 дней | фиксированные 15 дней для MVP | `SUPERSEDED` |
| C-20 | stakes можно считать из роли при создании/Booking/позднем Coach action | authoritative roles/stakes frozen at scheduled Session window opening; actual start separately confirmed by Coach; obligation Forfeit uses breach-time snapshot | `SUPERSEDED` |
| C-21 | только NORMAL/FORFEIT/NO_SHOW/DISPUTE_RESOLUTION | `WIN_A/WIN_B/DRAW/NO_CONTEST/FORFEIT/NO_SHOW`, а dispute живёт в Appeal | `SUPERSEDED` |
| C-22 | отсутствие формального Appeal/Safety rollback | 48h Appeal, compensating rollback, case-scoped Safety и participant/status locks | `EXTENDED_AND_SUPERSEDED` |
| C-23 | optional photo/video evidence у Result в MVP | Result media capability полностью отсутствует; evidence существует только в изолированных Appeal/Safety contours | `SUPERSEDED_FOR_MVP` |

Неразрешённых логических противоречий, способных заблокировать MVP Engine, после применения приоритета источников не осталось. Оставшиеся продуктовые параметры перечислены отдельно и имеют безопасные временные defaults.

## 12. Карта комплекта

- [DOMAIN_MODEL.md](DOMAIN_MODEL.md) — сущности, поля, связи, индексы и aggregate boundaries.
- [STATE_MACHINES.md](STATE_MACHINES.md) — все состояния и разрешённые переходы.
- [EVENTS_AND_INVARIANTS.md](EVENTS_AND_INVARIANTS.md) — event contract, status algebra, locks и rollback.
- [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md) — actor/action/guard matrix.
- [ACCEPTANCE_SCENARIOS.md](ACCEPTANCE_SCENARIOS.md) — проверяемые сценарии MVP.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) — только ещё не подтверждённые продуктовые решения и принятые assumptions.

### 12.1. Сознательно вне MVP

- in-app payments/refunds;
- CRM/import синхронизация GroupOffering и гарантия актуальной capacity;
- гарантированное место и attendance для Group Plan;
- несколько active competitive Community в UI;
- discipline-specific Competition;
- medical status freeze и medical-document storage;
- автоматическая проверка Coach diplomas/grades;
- полный guardian account/family contour;
- photo/video attachments к Result;
- social feed, Stories, public posts/comments и поиск людей по имени;
- hidden reliability/Elo/MMR и глобальный №1.

## 13. Definition of Done для реализации

Engine считается реализованным, когда:

- сервер отвергает любой переход вне таблиц `STATE_MACHINES.md`;
- каждое критичное изменение создаёт domain event и audit record;
- Booking, FIFO и Status проходят concurrency tests;
- Appeal может воспроизводимо восстановить pre-result projection без удаления истории;
- один и тот же command/timer безопасно повторяется;
- права проверяются на сервере, а не только скрытием UI;
- все обязательные сценарии `P0` из `ACCEPTANCE_SCENARIOS.md` автоматизированы.
