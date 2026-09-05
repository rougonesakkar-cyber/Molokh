# MOLOKH Open Product Questions and Assumptions

## 1. Как использовать документ

Здесь находятся только решения, которых нет в подтверждённом handoff. Они не отменяют уже согласованные правила. Нумерация продолжает предыдущую сессию вопросов с №204.

- `P0` — нужно решить до production launch или соответствующей функции.
- `P1` — безопасно уточнить во время пилота.
- `P2` — future architecture/product.
- `Working default` позволяет продолжать разработку и должен быть заменяем configuration/policy, если это возможно.

## 2. Решённые вопросы этой итерации

| ID | Каноническое решение |
|---|---|
| OQ-204 | In-app обязателен; критические события получают push. Event-SMS выключен по умолчанию и доступен только как добровольная настройка пользователя. Дедлайны server-based и не зависят от прочтения; подтверждённый сбой Molokh допускает no-fault восстановление/Appeal. |
| OQ-205 | Публично: текущий статус, история Champion/Contender, Official W/L/D, последние пять Official Results, нейтральные FORFEIT/NO_SHOW и общее число завершённых Training. Нет win rate, reliability score, Safety reasons и имён обычных партнёров. |
| OQ-206 | Gym Admin в Central ranges меняет Pair Cooldown 7–30d (default 15), NO_SHOW grace 5–30m (default 15), minimum booking notice 8–48h, ruleset, Slot/contact data. Appeal 48h, mandatory response 72h, reschedule limit 2, scheduling 14d, GENESIS 3d и queue reconfirm 24h едины. Новая version действует только на новые snapshots и публично видна. |
| OQ-207 | Personal Chat 12m inactivity; service Challenge/Appeal Chat 3y; Result/StatusTenure/AuditEvent бессрочно; Safety evidence 3y. Result photo/video feature полностью выключен в MVP. Account closure имеет recovery 30d, затем публичная identity обезличивается, immutable history остаётся; доступен self-export. |
| OQ-208 | `ACCOUNT_VERIFIED` выдаёт только Molokh Central по модерации профиля/телефона и duplicate signals. Документы не загружаются и не хранятся. Verification бессрочна до fraud/duplicate/material-data review; Official требует её, обычная Training — verified phone, Youth Official — ещё guardian consent. |
| OQ-209 | Для каждого Youth Athlete и каждого Official Challenge нужен отдельный guardian consent по одноразовой web-ссылке. Представитель декларирует имя/родство и подтверждает e-mail либо добровольный SMS; аккаунт и документы не нужны. Отзыв до Session закрывает Official no-fault с возможностью сохранить физическую Training. |
| OQ-210 | Один Athlete имеет максимум один accepted, ещё не завершённый Official obligation независимо от роли. Pending optional invitations и WAITING FIFO entries лимит не занимают; занятый Athlete не удерживает активный FIFO slot. Обычные Training разрешены без временного пересечения; уже confirmed процесс сохраняется при смене статуса. |
| OQ-211 | Optional Challenge ждёт ответа 48h, напоминает через 12h и 24h, затем закрывается no-fault. Получатель может отклонить, инициатор — отозвать до acceptance; повторное приглашение позднее разрешено при общей eligibility. |
| OQ-212 | Group schedule в MVP вводит Gym Admin вручную как `GroupOffering`. UI показывает `last_updated_at`, контакты и предупреждение уточнить места; Molokh не гарантирует capacity/freshness. Прошедшая запись скрывается автоматически; импорт/CRM остаётся будущим расширением. |
| OQ-213 | Slot показывает цену/валюту/короткие cancellation terms до подтверждения; при mutual selection сохраняется immutable snapshot. Оплата/refund идут напрямую с Venue, Molokh не рассматривает денежный спор; спортивное последствие отмены определяется отдельно по причине. |
| OQ-214 | Ruleset/version показывается до acceptance и фиксируется snapshot. Обычный `ACCEPT_CHALLENGE` одновременно записывает acknowledgment без отдельной галочки; отдельный checkbox нужен только для Central-approved `EXPLICIT_ACK_REQUIRED`. Ruleset не меняет status algebra. |
| OQ-215 | После self-request rejection повторная заявка доступна через 7d; раньше — по invite/QR либо решению Admin/Central. Пользователь видит нейтральную reason category, внутренний Safety context закрыт. Отказ не публичен и не является punishment. |
| OQ-216 | Community закрывает только Central по Closure Plan. Новые действия блокируются, pending processes закрываются no-fault, безопасные confirmed Sessions могут завершиться с Result/Appeal. StatusTenure закрываются `COMMUNITY_CLOSED` без W/L/Succession, Membership архивируются. Competition/status не мигрируют; relocation того же Venue — изменение адреса. |
| OQ-217 | Внутри Community публичен полный FIFO: display identity, position, submitted time и state, с выделенной active pair. Внешним пользователям — count/active Challenge. Eligibility/Block/Safety reasons скрыты; изменение порядка возможно только через audited event. |
| OQ-218 | При отсутствии Result: Coach reminder 2h, Gym Admin 12h, Central case 24h. Central собирает раздельные Athlete statements и Venue attendance; совпадение подтверждает назначенный reviewer-Coach. Спор/недостаток evidence → repeat no-fault; объективно невозможный repeat → reviewer-Coach `NO_CONTEST`. Исход не назначается Central произвольно. |
| OQ-219 | Result не принимает files. Только Appeal/Safety Case допускает до 5 image/short audio/video files, суммарно ≤100MB; PDF/archive/office запрещены. Central видит originals, submitter — свои, opponent/Coach — только case-scoped проверенное/редактированное disclosure. Encryption, scan, signed access, quarantine и retention обязательны. |
| OQ-220 | Future multi-Community/discipline feature выключена в MVP. Competition scope = Community+age division+discipline; Membership могут быть множественными, одна primary для Home/Discovery. Status/FIFO/Cooldown/stats раздельны и не переносятся; global accepted Official obligation limit остаётся один; глобального №1 нет. |
| OQ-221 | В 18 лет Athlete сразу становится Adult Ordinary. Started Youth Session завершается по frozen Youth snapshot; любая ещё не started Youth Official закрывается no-fault. Confirmed Booking можно удержать как Training через retention confirmations. Guardian consent/Youth queue завершаются, Youth tenure закрывается `AGE_TRANSITION`, статус/FIFO не переносятся. |
| OQ-222 | Personal/injury status freeze и medical documents отсутствуют. До accepted obligation Champion/Contender может добровольно освободить status и остаться Ordinary без loss/Cooldown; после acceptance действуют cancellation/Forfeit/Appeal. Discovery pause ничего не замораживает; Central no-fault — только отдельное подтверждённое исключение. |
| OQ-223 | Не более 3 исходящих unanswered optional Challenge на Athlete и одного на pair. После decline действует 48h quiet period; после 48h expiry повтор разрешён сразу. Block/Unmatch доступны; throttle не влияет на FIFO/mandatory/status/profile/reliability. |
| OQ-224 | До obligation Block/Unmatch закрывает Match-based optional Challenge, GroupPlan и Slot selection no-fault. Status FIFO/mandatory path сохраняется и становится service-only; Safety требует Report/Central. После acceptance Block/Unmatch не отменяет obligation. |
| OQ-225 | GENESIS/FIFO candidate — только explicit opt-in без hidden TTL. Первые двое по FIFO получают 48h mutual acceptance; declined/expired candidate закрывается, второй сохраняет timestamp и возвращается к head. Withdrawal no-fault; re-entry получает новый timestamp. |
| OQ-226 | Athlete свободно и сразу меняет display name на любое выбранное имя; это не legal identity и не запускает reverification. Stable User ID/verified badge/history сохраняются, старые имена доступны только Central audit. Avatar проходит content scan; незаконное/опасное имя рассматривается только через Report/Safety. |
| OQ-227 | Personal message edit ≤15m с marker; delete-for-self не отзывает сообщение у peer. Report freeze запрещает edits. Service/action messages immutable. Central может скрыть abusive content, сохраняя original как Case evidence по retention. |
| OQ-228 | Monitoring+Central создают audited PlatformIncident window/services. Pausable deadlines продлеваются на exact overlap; уже совершённые timeout/Forfeit получают compensating no-fault events без удаления истории. Session time/Cooldown/retention идут; individual delivery claim без Incident срок не меняет. |
| OQ-229 | Active obligations сохраняются при потере устройства/SIM и смене телефона. Recovery — verified phone либо Central без хранения документов. Phone change ставит 24h hold на sensitive actions, но старая authenticated session может выполнять service responses. Только подтверждённый access incident даёт no-fault deadline review. |
| OQ-230 | Duplicate accounts не сливаются автоматически. Central выбирает canonical User, ограничивает duplicate и ставит active obligations/status на Case hold. Immutable histories связываются private audited alias, публичный duplicate pseudonymized; status меняется только governed decision, не merge. |
| OQ-231 | Admin может заменить Coach без re-consent только при неизменных Venue/time/price/ruleset, с обязательным уведомлением. Athlete может одним действием запросить external no-fault reschedule, если Coach важен. Material terms требуют mutual reconfirmation; отсутствие Coach — external no-fault. |
| OQ-232 | LATE не определяет проигрыш: если Session фактически состоялась, Coach записывает обычный Result. NO_SHOW допустим после Venue grace только когда отсутствие Athlete объективно сорвало Session; отсутствие обоих → NO_CONTEST. Attendance/Result оспариваются в стандартные 48h. |
| OQ-233 | Venue имеет ровно одного PRIMARY_ADMIN и несколько ADMIN с одинаковыми обычными operational permissions. Primary appointment/transfer, Venue closure и security actions — только Central. Slots/GroupOffering/config within ranges доступны всем active Admin и аудируются. |
| OQ-234 | В `scheduled_start_at` SYSTEM открывает service window и фиксирует immutable competitive snapshot, но не утверждает факт проведения. `IN_PROGRESS` начинается только по команде Coach или первой Attendance. Athlete action/check-in отсутствует; отсутствие Coach action ведёт в missing-session review, не в ложную attended Session. |
| OQ-235 | Неявка Coach/неготовность Venue — external no-fault. Authorized equivalent replacement Coach может начать Session в пределах grace после уведомления; иначе Booking/Session закрываются, Challenge возвращается к scheduling без user reschedule count. Повторный operational failure рассматривает Central и не создаёт Athlete reliability signal. |
| OQ-236 | После фактического начала injury/voluntary withdrawal трактуются Coach по frozen ruleset и могут быть обычным decisive Result без medical documents. NO_CONTEST/no-fault допустим только для внешней Safety/Venue/equipment невозможности. До старта действуют обычные reschedule/cancellation rules. |
| OQ-237 | Final Result не получает повторный обычный Appeal. Central может открыть независимый Integrity Case только для fraud/system/identity error. Source history immutable; correction/annul/repeat применяются compensating events под status hold/replay, с публичной нейтральной reason category и закрытым evidence. |
| OQ-238 | Result/status публикуются сразу как provisional с нейтральной меткой «Предварительно / идёт проверка». После final метка исчезает. Reversal меняет public stats/last-five на effective outcome; Competition history сохраняет нейтральный факт пересмотра без Safety/evidence details. |

## 3. Открытые продуктовые вопросы

Открытых вопросов, блокирующих Core Engine v1.0, нет. Новые вопросы после пилота добавляются следующими номерами и не меняют v1.0 retroactively без versioned decision/migration.

## 4. Принятые технические assumptions

Эти пункты не требуют немедленного продуктового ответа; они выбраны как оптимальные и обратимые.

| ID | Assumption | Причина / как изменить |
|---|---|---|
| A-01 | модульный монолит + PostgreSQL + worker + transactional outbox | наименьший риск гонок MVP; модули можно выделять по events |
| A-02 | UUIDv7 и server timestamp; FIFO tie-break `(submitted_at, entry_id)` | строгий полный порядок без выбора человеком |
| A-03 | GENESIS DRAW/NO_CONTEST не назначает статус и требует repeat | нельзя определить победителя честно |
| A-04 | double NO_SHOW нормализуется в NO_CONTEST | нет победителя; причины всё равно аудируются |
| A-05 | scheduler в `scheduled_start_at` открывает READY_FOR_COACH и замораживает stakes; actual start создаёт только Coach Start/first Attendance | не требует Athlete check-in, не создаёт ложный attendance; поздняя обработка не меняет исторический competitive snapshot |
| A-06 | solo continuation TTL = min(1h, время до старта) | не удерживает Slot неопределённо; configurable |
| A-07 | Forfeit до физической встречи создаёт Result с `origin=ADMINISTRATIVE_FORFEIT`, `session_id=null` и обязательным context snapshot | status effect нужен без ложной attended Session |
| A-08 | дедлайны UTC/server-time, Venue IANA timezone, интервалы `[start,end)` | корректность DST и пересечений |
| A-09 | at-least-once events + inbox deduplication | практичнее distributed exactly-once |
| A-10 | Competition event journal + rebuildable projection, без полного event sourcing всех модулей | Appeal rollback и status history при умеренной сложности |
| A-11 | `ProcessHold` — отдельный overlay, а не дублированные `*_PAUSED` states | избегает state explosion и сохраняет точный resume state |
| A-12 | host confirmation истекает на границе `slot.start - minimum_booking_notice` | не оставляет бесконечный pending без дополнительного продукта timer |
| A-15 | один Athlete не может иметь пересекающиеся confirmed Session | предотвращает физически невозможные обязательства; final Booking claim блокирует Athlete calendars |
| A-16 | status-bearing Training/Group conversion confirmation holds FIFO slot no longer than min(72h, source start) | предотвращает блокировку очереди незавершённой конверсией; source остаётся non-official |
| A-17 | short Appeal/Safety audio/video = max 60s per file; signed evidence URL TTL = 5m | обратимые storage/security defaults внутри подтверждённых лимитов 5 files/100MB |

## 5. Не являются открытыми вопросами

Следующие решения уже подтверждены и не должны возвращаться на обсуждение без явной смены продукта:

- 14+, YOUTH 14–17 и ADULT 18+;
- Like только Discovery; Match нужен для обычных тренировок/Open paths;
- Coach обязателен; Athlete Check-in/Result confirmation отсутствуют;
- строгий FIFO, очередь принадлежит status slot и мигрирует с reconfirm 24h;
- Contender рискует статусом в каждом Official против Ordinary;
- любой started Champion↔Contender Official — TITLE;
- Champion может предложить TITLE, Contender свободно отказать; Contender→Champion mandatory;
- accepted 14d, одно +7d capacity extension, два user reschedule;
- Appeal 48h, result provisional сразу, rollback через compensation;
- Pair Cooldown 15d configurable;
- explicit GENESIS/Succession 3d;
- Community pause: confirmed Sessions остаются, pausable deadlines стоят, Cooldown идёт;
- REPORT case-scoped; Block/Unmatch не отменяют обязательства;
- обычная Training cancel/NO_SHOW не создаёт поражение/status/reliability;
- одна active competitive Community в MVP при multi-community data model.

## 6. Рекомендуемая следующая сессия

Core Engine v1.0 готов к технической реализации. Следующая рабочая сессия начинается с API/database contracts, vertical slices и UX synchronization; новые продуктовые вопросы не должны задерживать уже определённый MVP path.
