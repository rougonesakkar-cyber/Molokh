# Pre-Device Release Readiness

Проверка выполнена 28 октября 2026 года на ветке
`codex/client-foundation-performance-v1`, исходный `HEAD a2712b5`. Срез меняет только
универсальный Expo-клиент и release tooling. Доменные правила и серверные контракты не менялись.

## Проверенная среда

| Проверка | Статус | Результат |
|---|---|---|
| Production Web export | PASS | Существующий export открылся как статическая production-сборка; `/` и entry JS проходят `pnpm.cmd smoke:client`. |
| Console production Web | PASS | На доступном экране входа ошибок и actionable warnings нет. |
| API URL | PASS | Настройка называется `EXPO_PUBLIC_API_URL`; допускается только HTTP(S) URL без credentials, неверное значение даёт понятную ошибку. Web по умолчанию использует `http://localhost:3000`, Android Emulator — `http://10.0.2.2:3000`. |
| PostgreSQL/API | NOT RUN | Порты 5432/3000 закрыты; Docker CLI есть, но Docker Desktop Engine/исполняемый файл в этой среде недоступен. |
| Test accounts/seeds | PASS | API содержит детерминированные Athlete, Coach, replacement Coach, Gym Admin, Central и Membership applicant; переключатель доступен только в development-сборке. |
| Android SDK/ADB/AVD | PASS | SDK `D:\DevTools\Android\Sdk`, ADB доступен, AVD `medium_phone`/API 36 загружается. |
| Android app runtime | NOT RUN | Старый установленный dev client не содержит `ExpoSecureStore`; пересборка дважды остановлена Windows/Google Drive lock на `mergeDebugResources`. Код приложения до runtime-smoke не дошёл. |
| iOS/physical devices | NOT RUN | В этой Windows-среде нет iOS simulator и физических устройств. |
| Remote client CI | NOT RUN | У текущей локальной ветки нет remote run. Workflow теперь запускает общий gate, production Web smoke и gzip budget. |

Локальный API при старте создаёт seed идемпотентно. Поддерживаемого безопасного product-reset
нет; для изолированной PostgreSQL-проверки используется `pnpm.cmd test:db`. Удаление pilot volume
не является частью этого runbook.

## P0/P1 runtime matrix

Production shell доступен, но authenticated seeded-сценарии требуют PostgreSQL и API. Поэтому
они не отмечены как PASS по одним unit/integration-тестам.

| P0 | Статус | Причина |
|---|---|---|
| 1. Вход → Home → Profile | NOT RUN | Production login открыт; API/PostgreSQL недоступны. |
| 2. Discovery → Like → Match → Chats | NOT RUN | Нет seeded API runtime. |
| 3. Chat → Training → выбор → подтверждение | NOT RUN | Нет seeded API runtime. |
| 4. Official Challenge → слот → Gym/Coach | NOT RUN | Нет seeded API runtime. |
| 5. Создание OFFICIAL_CHALLENGE Session | NOT RUN | Нет seeded API runtime. |
| 6. Gym Admin schedule/requests | NOT RUN | Нет seeded API runtime. |
| 7. Coach Session/Result | NOT RUN | Нет seeded API runtime. |
| 8. Community/status/public profile | NOT RUN | Нет seeded API runtime. |
| 9. Back/deep link/section restore | NOT RUN | Navigation contract test PASS; authenticated browser/device path недоступен. |
| 10. Training/solo cancel без loss | NOT RUN | Нет seeded API runtime. |

| P1 | Статус | Причина |
|---|---|---|
| Appeal и 48-часовое окно | NOT RUN | Нет seeded API runtime. |
| Youth/guardian | NOT RUN | Нет seeded API runtime. |
| Safety/Central | NOT RUN | Нет seeded API runtime. |
| Перенос и отмена | NOT RUN | Нет seeded API runtime. |
| Частично завершённый сценарий после reload | NOT RUN | Нет seeded API runtime. |

Итого runtime: P0 `0 PASS / 0 FAIL / 10 NOT RUN`; P1 `0 PASS / 0 FAIL / 5 NOT RUN`.
Каждый `NOT RUN` имеет один подтверждённый infrastructure blocker, а не скрытый product PASS.

## Network, state and visual evidence

| Проверка | Статус | Доказательство |
|---|---|---|
| Cold/no-cache и warm/cache | PASS | Query tests проверяют первое чтение и отсутствие второго запроса для fresh cache. |
| Slow response и deduplication | PASS | Два конкурентных чтения используют один fetch и один AbortSignal. |
| Stale request cancellation | PASS | Session switch отменяет/удаляет старые queries; stale responses защищены sequence guard. |
| Secondary endpoint failure | PASS | `settleSecondaryQuery` изолирует отказ; основная projection остаётся доступной. |
| Offline cached content → reconnect | PASS | Stale cache остаётся видимым, UI сообщает, что команды не ставятся в очередь; reconnect заменяет cache. |
| Loading/refreshing/error/offline | PASS | Состояния имеют отдельный текст, live region и явный retry; production login shell отрисован. |
| Status-command retry | PASS | Повтор использует сохранённый idempotency key до успешного ответа. |
| Hidden mutation retry | PASS | QueryClient mutations имеют `retry: false`; Booking/Challenge/Result/status offline queue отсутствует. |
| Chat/list scale | PARTIAL | Chat использует `FlatList` и cursor pages; authenticated long-chat/large-list runtime не выполнен. |

До исправления production Web на 375 px показал touch targets 44 px, пустой document title и
несогласованную реакцию на `prefers-color-scheme: dark`.
[Before](pre-device-evidence/02-production-web-login-375x812.png). Финальная проверка подтверждает
`Molokh` title, 48 px input/button, отсутствие horizontal scroll и ноль console error/warning.
Web оставлен в согласованной light palette: полный dark wrapper не готов и не заявлен как PASS.
[After](pre-device-evidence/09-production-web-login-375x812.png).

На 375, 768 и 1440 CSS px `scrollWidth` равнялся viewport: неожиданный горизонтальный scroll
не обнаружен. Фактический browser zoom 200%, экранная клавиатура Chat, длинные authenticated
списки и все role surfaces — NOT RUN без API/browser zoom control. Их нельзя заменять уменьшением
viewport. Android AVD загрузился с 1080×2400, density 420, font scale 1.0; runtime blocker сохранён
на [снимке](pre-device-evidence/08-android-emulator-api-unavailable.png).

## Исправленные дефекты и финальные гейты

- Login input/button/link теперь не меньше 48 px; accessibility gate охватывает auth panel.
- Login panel использует semantic tokens; Web принудительно сохраняет согласованную light palette,
  пока Expo/React Native Web wrapper не сможет атомарно применить dark background и text colors.
- Web document title после hydration стабильно равен `Molokh`.
- Неверный `EXPO_PUBLIC_API_URL` больше не превращается в неясную fetch-ошибку.
- Явный retry status-команды сохраняет исходный idempotency key; скрытый mutation retry выключен.
- Production Web получил воспроизводимый smoke script и CI gzip budget.
- Финальные gates: typecheck PASS; Vitest `18/18` files и `51/51` tests PASS; accessibility PASS;
  production Web build PASS; smoke PASS; bundle budget PASS.
- Bundle: baseline `407,684 B gzip`, итог `415,211 B gzip`, delta `+1.85%`;
  raw entry `1,816,225 B`, полный dist `2,026,477 B`, 27 файлов.

## Повторение проверки и pilot checklist

```powershell
# Local seeded runtime
docker compose -f infra/compose.yaml up -d --wait postgres
pnpm.cmd dev:api
pnpm.cmd dev:worker
pnpm.cmd --filter @molokh/client web

# Production Web artifact
$env:EXPO_PUBLIC_API_URL = 'https://api.pilot.example'
pnpm.cmd --filter @molokh/client build
pnpm.cmd smoke:client
pnpm.cmd measure:client
python -m http.server 8081 -d apps/client/dist

# Android Emulator; rebuild in a non-synced local checkout if Google Drive locks Gradle output
emulator -avd medium_phone -no-snapshot-load
adb wait-for-device
adb reverse tcp:8081 tcp:8081
pnpm.cmd --filter @molokh/client android --no-bundler
pnpm.cmd --filter @molokh/client start --android
```

Перед закрытым пилотом: проверить HTTPS API URL, выполнить пять client gates, `smoke:client`,
`measure:client`, seeded P0/P1 matrix и `pnpm.cmd monitor:pilot`. Для отката сначала выполнить
`pnpm.cmd check:rollback`, затем развернуть ранее проверенный release SHA; не откатывать доменную
историю reset/rebase или восстановлением старой БД.

## Граница готовности

Кодовая база готова к следующему device/runtime блоку: локальные финальные gates зелёные. Закрытый
пилот ещё не разрешён: сначала нужен live seeded P0/P1 прогон с PostgreSQL/API, успешная Android
сборка вне синхронизируемой папки и физические iOS/Android проверки cold/warm start, Back,
orientation, keyboard, offline/reconnect, VoiceOver/TalkBack и 200% text. Полный Web dark mode
остаётся отдельным P1 visual residual и не блокирует согласованную light-theme проверку.
