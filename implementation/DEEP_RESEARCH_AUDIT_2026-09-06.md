# MOLOKH — Deep Research audit

**Дата проверки:** 6 сентября 2026  
**Проверенный baseline:** `cbba0104ed1117a2e3836f4ec924808ccbf10ac4`  
**Цель:** независимо перепроверить продуктовую формализацию, архитектуру, код, тесты, инфраструктуру и готовность закрытого MVP одного зала по актуальным первичным источникам.

## Итог

Архитектуру и стек менять не нужно. Выбранная форма — universal Expo-клиент, Fastify modular monolith, PostgreSQL и отдельный Graphile Worker — остаётся оптимальной для Molokh: она проста, недорога и позволяет делать самые рискованные операции атомарно без микросервисной сложности.

Статус проекта:

| Область | Решение |
|---|---|
| Продолжать локальную разработку | **GO** |
| Продолжать M3 Like/Match | **GO** |
| Считать Core Engine уже реализованным целиком | **NO** — формализация завершена, исполняются только первые slices |
| Отдавать приложение реальным участникам пилота | **NO-GO** до закрытия P0 ниже |
| Менять технический стек | **Не требуется** |

Главный вывод: проект не переусложнён и движется правильно. Самая сильная часть — фундамент целостности данных. Самый большой оставшийся объём — не инфраструктура, а пользовательский путь `Match → Chat → Booking → Session → Result`, после которого появится настоящий MVP.

## Состояние исправлений после аудита — 7 сентября 2026

Этот раздел обновляет point-in-time findings ниже; исходные результаты аудита сохранены для
проверяемости.

| Finding | Текущее состояние |
|---|---|
| P0.1 продуктовый путь | Discovery mutations, Like/Skip, оба expiry timer и atomic Match/personal Chat container реализованы; сообщения и Training ещё впереди |
| P0.4 API edge | официальный CORS, Helmet и глобальный rate limit подключены; production proxy policy остаётся deployment-задачей |
| P0.5 readiness | разделены `/health/live` и DB-backed `/health/ready` |
| P1.1 AC traceability | gate генерирует matrix и отклоняет неизвестные `AC-###`; 10/213 сценариев уже связаны с executable tests |
| P1.4 log redaction | authorization/cookie/access/refresh token paths удаляются из API logs |
| P1.5 PostgreSQL bind | local Compose публикует порт только на `127.0.0.1` |
| P1.6 migration checksum | SHA-256 сохраняется и drift останавливает migration startup/CI |
| P1.7 client split | Discovery/Match UI вынесен в отдельный feature-компонент; дальнейшее разделение продолжится с Chat |
| P1.8 CORS causation | `X-Causation-Id` включён в официальный preflight contract |
| Dependency CI | `pnpm audit --prod --audit-level high` добавлен как обязательный gate; две известные moderate зависимости остаются видимыми |

На хосте повторилась внешняя ошибка Docker Desktop с недоступным
`sailor-ingest.sock`. Последний PostgreSQL gate прошёл 10 тестов до добавления финального
assertion suppression expiry; текущие типы/unit/API/build зелёные, а полный DB/live rerun
нужно выполнить после перезапуска Windows.

## Что проверено фактически

| Проверка | Результат |
|---|---:|
| `pnpm.cmd check` | PASS |
| Strict TypeScript | PASS во всех 7 workspace-пакетах |
| Быстрые automated tests | 48 PASS |
| PostgreSQL integration tests | 8 PASS |
| Web production export | PASS, 3 static routes |
| `expo install --check` | PASS |
| Expo Doctor | 21/21 PASS |
| Core validator | 300 переходов, 278 событий, 213 AC, 0 вопросов, 0 ошибок |
| Docker Compose | Валидная конфигурация, PostgreSQL 18 healthy |
| Live API + реальная БД | Identity, Community и Discovery отвечают 200 |
| Dependency audit | 2 moderate transitive advisories |
| Git/CI enforcement | Локальный Git чист; remote и branch protection отсутствуют |

В документации есть небольшое расхождение: [TECHNICAL_SPIKE_STATUS.md](TECHNICAL_SPIKE_STATUS.md) всё ещё говорит о 7 PostgreSQL-сценариях, тогда как текущий gate выполняет 8. Это не дефект продукта, но status-документы следует обновлять из автоматически генерируемых результатов.

## Что сделано особенно хорошо

### 1. Стек соответствует цели проекта

Expo Router официально рассчитан на общий routing и компоненты для Android, iOS и Web; это подтверждает выбранную стратегию одного клиента без трёх отдельных приложений. [Expo Router](https://docs.expo.dev/router/introduction/)

Fastify рекомендует schema-based validation и response serialization; response-схемы также снижают риск случайной выдачи приватных полей. В Molokh это уже применяется вместе с TypeBox, безопасным error mapping и проверками, что телефон и дата рождения не попадают в public projection. [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)

### 2. Транзакционный фундамент сильный

`executePlatformCommand` сериализует idempotency scope и aggregate, сверяет version, а затем сохраняет mutation, Domain Event, Audit, Outbox и ответ в одной транзакции. Повтор возвращает сохранённый ответ, изменённый payload отклоняется, rollback не оставляет половинчатой истории.

Использование `pg_advisory_xact_lock` корректно: PostgreSQL удерживает такой lock до завершения транзакции. [PostgreSQL advisory locks](https://www.postgresql.org/docs/18/functions-admin.html)

### 3. Инварианты не оставлены только приложению

Роли, возраст, membership, конфигурации и social-пары защищены CHECK/FOREIGN KEY/partial UNIQUE индексами. Отдельно перепроверена тонкость `NULL`: PostgreSQL по умолчанию считает `NULL` различными в UNIQUE, но Molokh уже компенсирует это отдельным partial unique index для глобальной роли Central. [PostgreSQL unique indexes](https://www.postgresql.org/docs/18/indexes-unique.html)

### 4. Философия продукта отражена в коде

- отображаемое имя не превращено в «паспортное имя»;
- документы и Result media не собираются;
- Central verification требуется для Official Challenge, но не блокирует Discovery и ordinary Training;
- Coach/Admin authority проверяется по живому scope в базе;
- Discovery сначала исчерпывает радиус, потом расширяется по городу;
- входящий интерес показывается явно;
- скрытого reliability score нет, причины порядка доступны клиенту.

### 5. Scope MVP удерживается

Не добавлены Redis, Kubernetes, микросервисы, отдельный Admin frontend, payments, object storage и ML-ranking. Для одного пилотного зала это правильное ограничение сложности.

## Критические P0 до реального пилота

### P0.1 — закончить пользовательский путь

Сейчас работают Identity, Community/Roles, Central verification и чтение Discovery. Ещё отсутствуют:

1. Like, Skip, suppression и Like expiry;
2. атомарный mutual-Like Match;
3. Chat и структурированные action cards;
4. Slot/GroupOffering, взаимный выбор и host confirmation;
5. Booking, Session и Coach attendance/result;
6. Challenge/FIFO/Status/Cooldown;
7. Appeal и Central governance.

Поэтому текущая сборка — качественный рабочий фундамент и demo, но ещё не закрытый MVP.

### P0.2 — production authentication и session lifecycle

[server.ts](../apps/api/src/server.ts) намеренно запрещает production startup без нового AuthAdapter. Клиент при этом использует local bearer token из `EXPO_PUBLIC_LOCAL_AUTH_TOKEN` или исходного fallback. Expo прямо предупреждает, что все `EXPO_PUBLIC_*` значения видны в compiled bundle. [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)

До внешних пользователей нужны:

- OTP/provider adapter без хранения raw OTP;
- короткоживущая access session и вращаемая/revocable refresh session;
- SecureStore на iOS/Android;
- Secure + HttpOnly + SameSite cookie для Web;
- logout/revoke/recovery и audit событий session security.

Эта платформенная модель соответствует текущим рекомендациям Expo для native и Web. [Expo authentication](https://docs.expo.dev/develop/authentication/)

### P0.3 — закрыть известные dependency advisories

`pnpm audit --prod` нашёл две moderate зависимости:

- `decode-uri-component@0.2.2` через Expo Router/query-string — возможен CPU denial of service на специально сформированной URI; [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
- старые `uuid` через Expo/Xcode tooling — нарушение bounds для отдельных buffer API; путь менее похож на runtime exploit Molokh, но должен быть устранён/документирован; [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

Не следует обновлять React Native отдельно от Expo. Нужно сначала проверить доступный Expo-compatible patch; если его нет — протестировать точечный `pnpm.overrides`, повторив Expo Doctor, Web export и Android build.

### P0.4 — добавить Internet-facing security baseline

В API пока нет rate limiting и security headers, CORS реализован вручную, production trust-proxy policy не зафиксирован. Это нормально для local slice, но не для публичного адреса. OWASP отдельно выделяет broken authentication/authorization и unrestricted resource consumption среди основных API-рисков. [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

Для Fastify 5 существуют официально совместимые версии `@fastify/cors`, `@fastify/helmet` и `@fastify/rate-limit`; их использование проще и надёжнее собственного расширяющегося hook. [CORS compatibility](https://github.com/fastify/fastify-cors), [Helmet compatibility](https://github.com/fastify/fastify-helmet), [Rate limit compatibility](https://github.com/fastify/fastify-rate-limit)

### P0.5 — сделать readiness правдивым

`/health/ready` всегда отвечает `ok` и не проверяет PostgreSQL. При потере базы балансировщик продолжит считать API готовым. Readiness должен проверять обязательные backend dependencies, а отдельный liveness — только жизнь процесса. [Readiness/liveness guidance](https://kubernetes.io/docs/concepts/workloads/pods/probes/)

### P0.6 — доказать backup/restore

До появления ценных пилотных данных нужны автоматический backup, retention, alert на неуспешный backup и восстановление в чистую БД. PostgreSQL рекомендует регулярные backups; custom-format `pg_dump` можно проверять через `pg_restore`. [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/18/backup.html)

### P0.7 — не включать Youth без внешней проверки

Код корректно разделяет 14–17 и 18+, но до пилота с несовершеннолетними нужны проверенные тексты согласия, privacy/retention policy и операционный процесс. Пока это не подтверждено для фактической юрисдикции запуска, Youth-контур лучше оставить выключенным feature/policy flag. Это юридический gate, а не причина менять Core.

## P1: исправить сейчас или в ближайшие два спринта

### P1.1 — связать Core AC с тестами

В спецификации 213 acceptance scenarios, однако ни один executable test не содержит `AC-###`. [TEST_STRATEGY.md](TEST_STRATEGY.md) уже требует отчёт `AC ID → test → status → environment`, но gate ещё не реализован.

Это самая важная следующая проверка Core Engine: добавлять AC-ссылки по мере реализации slice и автоматически строить coverage matrix. Иначе формальная спецификация и код могут начать расходиться незаметно.

### P1.2 — закрепить эксплуатационные гарантии Outbox → Graphile

[apps/worker/src/server.ts](../apps/worker/src/server.ts) использует `unsafe_dedupe`. Документация Graphile требует осторожности с этим режимом и описывает редкую job-key гонку. Проверка установленной версии показала, что её JS helper превращает отсутствие строки Job в rejected promise; существующий Outbox dispatcher затем освобождает сообщение для retry. Потерю события в текущем пути воспроизвести не удалось. [Graphile Worker job keys](https://worker.graphile.org/docs/job-key)

До пилота всё равно следует:

- зафиксировать это поведение отдельным integration/regression test;
- явно документировать, почему для уникального `outbox:<messageId>` выбран `unsafe_dedupe`, либо перейти на более безопасный режим;
- добавить failed-job/dead-letter dashboard и alert;
- сохранить Inbox dedupe как последнюю защиту повторной доставки.

### P1.3 — превратить CI template в реальный gate

Workflow качественный: минимальные permissions, frozen lockfile, PostgreSQL service, tests/build/spec. Но remote отсутствует, поэтому он ещё не исполнялся как обязательная проверка PR.

После создания remote:

- включить protected `main` и required workflow;
- добавить dependency audit/alerts;
- закрепить Actions полными commit SHA. GitHub указывает, что full SHA — единственная immutable ссылка на Action. [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use)

### P1.4 — задать log redaction явно

Логи сейчас не показывают токен в обычном request serializer, но redaction для `authorization`, `cookie`, OTP/session fields не настроен. Pino поддерживает удаление/redaction указанных путей с небольшими затратами. [Pino redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md)

### P1.5 — ограничить локальный PostgreSQL localhost

В [compose.yaml](../infra/compose.yaml) указано `5432:5432`, что публикует порт на всех host interfaces. Docker прямо документирует такое поведение. Для local-only базы следует использовать `127.0.0.1:5432:5432`. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)

### P1.6 — добавить checksum миграций

Migration runner использует глобальный advisory lock и транзакции — это хорошо. Но `schema_migrations` хранит только имя файла. Если применённый SQL будет случайно изменён, drift не обнаружится. Следует сохранять SHA-256 содержимого и останавливать startup/CI при несовпадении, не вводя rollback migrations.

### P1.7 — разделить клиент перед Chat/Booking

[index.tsx](../apps/client/src/app/index.tsx) уже объединяет загрузку, команды, роль-зависимые блоки и все состояния на одном экране. Это допустимо для первого vertical slice, но станет источником ошибок при Match/Chat/Booking.

Оптимальный момент для разделения — одновременно с первым Match:

- routes/screens по основным journeys;
- feature API/hooks;
- уже установленный TanStack Query для canonical server state;
- явно заданные retry/stale/offline правила;
- component/accessibility tests.

React Native предоставляет семантику screen reader и роли, но её нужно проверять тестами, а не только наличием отдельных `accessibilityRole`. [React Native Accessibility](https://reactnative.dev/docs/accessibility.html)

### P1.8 — устранить малые contract gaps

- `X-Causation-Id` принимается request context, но отсутствует в `Access-Control-Allow-Headers`;
- OpenAPI 3.1 генерируется, но весь документ не проходит отдельную lint/schema и breaking-change проверку;
- status-документы обновляются вручную и уже отстали на один DB test.

## P2: оставить до появления измеримого масштаба

Discovery сейчас загружает кандидатов всего города, считает расстояние/rank в Node.js и только затем применяет `limit`. Для одного пилотного зала это проще и приемлемо. Перед несколькими залами понадобятся cursor pagination, SQL/spatial prefilter и `EXPLAIN`/load test, но добавлять PostGIS или отдельный search service сейчас преждевременно.

`recentActivityBucket` и `responseSpeedBucket` правильно оставлены нейтральными: их нельзя включать в сортировку, пока нет канонических, объяснимых данных.

## Насколько мы укладываемся в план

| Milestone | Реальная готовность | Комментарий |
|---|---:|---|
| Core v1 formalization | 100% | 300 переходов, 213 AC, нет открытых вопросов |
| M0 Workspace | 100% | Локальные gates и Android/Web доказаны |
| M1 Platform integrity | 100% | Транзакции, idempotency, outbox, timer seam, notifications |
| M2 Identity & Community | ~85–90% local | Production auth/recovery/duplicate cases остались |
| M3 Discovery, Match & Chat | ~25–30% | Read готов; mutations и Chat отсутствуют |
| M4–M8 | Planned | Основной пользовательский и competitive пути впереди |

В целом исполняемая часть закрытого MVP готова примерно на треть. При этом самый технически рискованный фундамент уже построен.

По календарю проект примерно на две недели впереди: Sprint 1 и большая часть Sprint 2 завершены до их запланированного старта, Sprint 3 уже начат 6 сентября. Этот запас лучше потратить на короткий integrity/security pass, а не на расширение scope.

## Рекомендуемый порядок следующих работ

1. Короткий hardening pass: advisories, truthful readiness, localhost DB, Pino redaction, Fastify CORS/helmet/rate-limit seam, Graphile regression coverage, AC coverage skeleton.
2. Вернуться к M3: `Like → Skip/suppression → Like expiry → atomic Match → Block/Unmatch`.
3. Разделить клиент по journeys и добавить TanStack Query во время первого двухпользовательского Match.
4. Реализовать Chat только со структурированными actions, без парсинга текста.
5. Сначала закончить ordinary Training: `Slot → mutual choice → host confirm → Booking → Session → Coach Result`.
6. Затем строить Challenge/Status на уже доказанной Session-модели.
7. Перед внешним пилотом закрыть production auth, backups/restore, monitoring, accessibility/privacy/security review, iOS build и Youth decision.

## Ограничения исследования

- Не выполнены hosted CI, iOS build, production deploy, нагрузочный тест, penetration test и restore rehearsal: для них нужны внешняя инфраструктура/учётные данные.
- Это инженерный и продуктовый аудит, не юридическое заключение.
- Рискованные текущие модули проверены глубоко; все 300 ещё не реализованных переходов нельзя считать доказанными только потому, что их Markdown-спецификация валидна.
