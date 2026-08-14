# Large-Program Blueprints — Searchable Catalog
> Generated: 2026-08-04
> Purpose: A searchable index of every curated large-program blueprint in the
> training library. The model consults this catalog to pick an architecture for
> a requested app type: each entry lists the language, the feature slices that
> decompose the app, and the layering pattern used. Converted to training
> examples by `scripts/build-vaca-knowledge-dataset.py`.

---

---

## How to use this catalog

1. Match the requested app to a blueprint below (search by domain or feature).
2. Check the language — if the user asked for a different language, keep the
   feature breakdown and re-map it onto that language's layering (Go:
   cmd/internal → handlers/services/repo/models; TypeScript: src/ →
   routes/services/repo/models; Python: app/ → routers/services/repo/models;
   C#: .NET solution → Api/Application/Domain/Infrastructure).
3. Every blueprint decomposes into 4–6 feature slices. Each slice gets models +
   repository + service (+ handlers/routes/API) + tests, then shared layers
   (entry, config, middleware/db, health, README, build files) are added.
4. Always plan 25+ files for these apps — one file = one responsibility.
5. 39 blueprints span 4 languages and 20+ domains; the domain index below maps
   common requests to the right blueprint ID.

---

## Quick reference (39 blueprints)

| # | ID | Language | App type | Features |
|---|----|----------|----------|----------|
| 1 | ecommerce-go | Go | E-commerce platform | users, catalog, cart, checkout, orders |
| 2 | analytics-ts | TypeScript | SaaS analytics dashboard | projects, events, metrics, users, API tokens |
| 3 | cms-python | Python | Multi-tenant CMS | content types, drafts, publishing, media, roles |
| 4 | social-ts | TypeScript | Social network | profiles, posts, comments, likes, follows, feed, notifications |
| 5 | banking-csharp | C# | Banking backend | accounts, transfers, ledger, statements, audit |
| 6 | chat-go | Go | Realtime chat | WS connections, rooms, DMs, presence, history |
| 7 | gaming-ts | TypeScript | Gaming platform | profiles, matchmaking, matches, leaderboards, tournaments |
| 8 | filebox-go | Go | File sharing service | users, files, folders, shares, activity |
| 9 | shortlink-go | Go | URL shortener | users, links, clicks, campaigns |
| 10 | jobboard-go | Go | Job board | companies, jobs, candidates, applications, matches |
| 11 | kitchen-go | Go | Restaurant ordering (POS) | menus, tables, orders, kitchen queue, payments |
| 12 | fitness-ts | TypeScript | Fitness tracker | users, workouts, exercises, goals, progress |
| 13 | kanban-ts | TypeScript | Project management (kanban) | projects, boards, tasks, comments, activity |
| 14 | stream-ts | TypeScript | Music streaming | artists, albums, tracks, playlists, history |
| 15 | news-ts | TypeScript | News aggregator | feeds, articles, users, bookmarks, alerts |
| 16 | forum-python | Python | Community forum | users, threads, posts, votes, moderation |
| 17 | academy-python | Python | E-learning platform | courses, lessons, enrollments, quizzes, progress |
| 18 | helpdesk-python | Python | Help desk / support | tickets, agents, responses, SLAs, reports |
| 19 | estate-python | Python | Real estate platform | listings, agents, searches, tours, favorites |
| 20 | expense-csharp | C# | Personal finance | accounts, transactions, budgets, categories, reports |
| 21 | hr-csharp | C# | HR management | employees, departments, time-off, reviews, payroll |
| 22 | crm-csharp | C# | CRM | contacts, companies, deals, activities, pipelines |
| 23 | clinic-csharp | C# | Clinic management | patients, appointments, doctors, prescriptions, billing |
| 24 | fleet-go | Go | Fleet management | vehicles, drivers, routes, shipments, telemetry |
| 25 | paygate-go | Go | Payment gateway | merchants, payments, payouts, webhooks, reconciliation |
| 26 | teamchat-go | Go | Team chat | channels, members, messages, threads, reactions |
| 27 | subbilling-go | Go | Subscription billing | plans, customers, subscriptions, invoices, usage |
| 28 | iot-ts | TypeScript | IoT dashboard | devices, telemetry, alerts, dashboards, users |
| 29 | hotel-ts | TypeScript | Hotel booking | hotels, rooms, reservations, guests, availability |
| 30 | courier-ts | TypeScript | Courier delivery | couriers, packages, pickups, deliveries, tracking |
| 31 | wallet-ts | TypeScript | Digital wallet | wallets, transactions, transfers, cards, statements |
| 32 | subsaas-python | Python | Subscription platform | customers, plans, subscriptions, payments, dunning |
| 33 | eventbook-python | Python | Event booking | events, tickets, orders, attendees, seats |
| 34 | smarthome-python | Python | Smart home hub | devices, rooms, scenes, automations, logs |
| 35 | fieldservice-python | Python | Field service dispatch | technicians, work orders, schedules, inventory, invoices |
| 36 | payment-csharp | C# | Payment processing | accounts, payments, settlements, disputes, reports |
| 37 | teams-msg-csharp | C# | Enterprise messaging | teams, channels, messages, mentions, search |
| 38 | membership-csharp | C# | Membership management | members, plans, renewals, benefits, billing |
| 39 | iot-csharp | C# | Industrial IoT monitoring | sensors, readings, thresholds, alerts, dashboards |

---

## Go blueprints (cmd/internal layering: handlers → services → repo → models)

### 1. ecommerce-go — E-commerce platform (26 files)
- **Goal:** user accounts, product catalog, cart, checkout, orders.
- **Reasoning:** Multi-tenant storefront decomposed by feature with shared
  models/repository/services/handlers layering; imports flow one way
  (handlers → services → repo → models).
- **Feature slices:** users · product catalog · cart · checkout · orders.
- **Notable design points:** cart vs order lifecycle separation, checkout
  transactions, order status flow.

### 6. chat-go — Realtime chat platform (26 files)
- **Goal:** WebSocket connections, rooms, direct messages, presence, history.
- **Reasoning:** Realtime messaging with a WebSocket hub (goroutines +
  channels); the hub owns all connections, services own business rules,
  handlers bridge HTTP/WS to services.
- **Feature slices:** connection hub · rooms · direct messages · presence ·
  message history.

### 8. filebox-go — File sharing service (33 files)
- **Goal:** secure file storage: validated uploads, folder hierarchy, share
  links with expiry, append-only activity log.
- **Feature slices:**
  - `users` → User: auth + quota limits
  - `files` → File: upload validation + metadata
  - `folders` → Folder: hierarchy + move rules
  - `shares` → Share: expiring share links
  - `activity` → ActivityLog: append-only audit trail

### 9. shortlink-go — URL shortener (28 files)
- **Goal:** link shortening at scale: collision-safe keys, per-click analytics,
  per-user link management, campaign attribution.
- **Feature slices:**
  - `users` → User: accounts + API keys
  - `links` → Link: key generation + expiry
  - `clicks` → ClickEvent: per-click tracking
  - `campaigns` → Campaign: attribution + tag filtering

### 10. jobboard-go — Job board (33 files)
- **Goal:** recruitment platform: company profiles, job listings, candidate
  resumes, applications with status flow, skill-based matching.
- **Feature slices:**
  - `companies` → Company: profiles + verification
  - `jobs` → Job: listings + status flow
  - `candidates` → Candidate: resume + skills
  - `applications` → Application: apply + status transitions
  - `matches` → Match: skill-based scoring

### 11. kitchen-go — Restaurant ordering (POS) (33 files)
- **Goal:** point-of-sale: menu management, table state, order lifecycle,
  kitchen ticket queue, payment reconciliation.
- **Feature slices:**
  - `menus` → Menu: items + availability
  - `tables` → Table: seat state + assignment
  - `orders` → Order: order lifecycle
  - `kitchen` → KitchenQueue: ticket queue + completion
  - `payments` → Payment: charge + reconcile

### 24. fleet-go — Fleet management (33 files)
- **Goal:** vehicle registry, driver assignment, route planning, shipment
  status, GPS telemetry ingestion.
- **Feature slices:**
  - `vehicles` → Vehicle: registry + status
  - `drivers` → Driver: assignments + hours
  - `routes` → Route: planning + stops
  - `shipments` → Shipment: status + tracking
  - `telemetry` → TelemetryReading: GPS ingestion + alerts

### 25. paygate-go — Payment gateway (33 files)
- **Goal:** merchant onboarding, payment capture with idempotency, payout
  scheduling, webhook delivery, end-of-day reconciliation.
- **Feature slices:**
  - `merchants` → Merchant: onboarding + credentials
  - `payments` → Payment: capture + idempotency
  - `payouts` → Payout: scheduling + transfer
  - `webhooks` → WebhookDelivery: retry + signatures
  - `reconciliation` → ReconciliationRun: settlement matching

### 26. teamchat-go — Team chat (33 files)
- **Goal:** Slack-style workspace chat: channel membership, threaded messages,
  reactions, presence; a WebSocket hub handles realtime delivery.
- **Feature slices:**
  - `channels` → Channel: workspace + membership
  - `members` → Membership: roles + invites
  - `messages` → Message: post + edit history
  - `threads` → Thread: replies + ordering
  - `reactions` → Reaction: emoji + counts

### 27. subbilling-go — Subscription billing (33 files)
- **Goal:** SaaS billing: plan catalog, customer lifecycle, subscription
  states, prorated invoicing, usage metering.
- **Feature slices:**
  - `plans` → Plan: catalog + pricing
  - `customers` → Customer: accounts + tax info
  - `subscriptions` → Subscription: lifecycle + renewal
  - `invoices` → Invoice: billing + payment
  - `usage` → UsageRecord: metering + quotas

---

## TypeScript blueprints (src/ layering: routes → services → repositories → models)

### 2. analytics-ts — SaaS analytics dashboard (25 files)
- **Goal:** projects, event ingestion, metrics, user management, API tokens.
- **Reasoning:** Event ingestion + analytics with src/ layering, each feature
  as a vertical slice, tests beside services.
- **Feature slices:** projects · event ingestion · metrics computation ·
  user management · API tokens.

### 4. social-ts — Social network (29 files)
- **Goal:** user profiles, posts, comments, likes, follows, a personalized
  feed, and notifications.
- **Reasoning:** Timeline platform with src/ layering; the feed is an
  aggregation service over posts/likes/follows; notifications subscribe to
  events.
- **Feature slices:** auth/profiles · posts · comments · likes · follows ·
  feed assembly · notifications.

### 7. gaming-ts — Gaming platform (29 files)
- **Goal:** user profiles, matchmaking, ranked matches, leaderboards,
  tournaments.
- **Reasoning:** Competitive gaming, event-driven: services publish match
  results; leaderboard and tournament services consume them.
- **Feature slices:** profiles · matchmaking queue · match lifecycle ·
  ELO/rank updates · leaderboards · tournaments.

### 12. fitness-ts — Fitness tracker (33 files)
- **Goal:** health tracking: workout logging, exercise library, goal setting,
  progress analytics over time.
- **Feature slices:**
  - `users` → User: profiles + auth
  - `workouts` → Workout: session logging
  - `exercises` → Exercise: library + muscles
  - `goals` → Goal: targets + tracking
  - `progress` → ProgressPoint: analytics rollups

### 13. kanban-ts — Project management (kanban) (33 files)
- **Goal:** kanban workspace: project/board hierarchy, task lifecycle across
  columns, comments, activity feed.
- **Feature slices:**
  - `projects` → Project: workspace + members
  - `boards` → Board: columns + ordering
  - `tasks` → Task: cards + status flow
  - `comments` → Comment: task discussion
  - `activity` → Activity: change feed

### 14. stream-ts — Music streaming (33 files)
- **Goal:** streaming catalog: artist/album/track hierarchy, user playlists,
  playback history for recommendations.
- **Feature slices:**
  - `artists` → Artist: profiles + releases
  - `albums` → Album: release grouping
  - `tracks` → Track: metadata + audio refs
  - `playlists` → Playlist: curation + ordering
  - `history` → PlaybackEvent: listening log

### 15. news-ts — News aggregator (33 files)
- **Goal:** RSS-style aggregation: feed subscriptions, deduped article
  ingestion, user bookmarks, keyword alerts.
- **Feature slices:**
  - `feeds` → Feed: subscriptions + fetching
  - `articles` → Article: ingest + dedupe
  - `users` → User: accounts + preferences
  - `bookmarks` → Bookmark: saved articles
  - `alerts` → Alert: keyword notifications

### 28. iot-ts — IoT dashboard (33 files)
- **Goal:** device registry, time-series telemetry, threshold alerts,
  configurable dashboards, user scopes; an ingestion pipeline feeds metrics.
- **Feature slices:**
  - `devices` → Device: registry + provisioning
  - `telemetry` → TelemetryPoint: time-series ingestion
  - `alerts` → Alert: threshold rules + firing
  - `dashboards` → Dashboard: widgets + layout
  - `users` → User: accounts + scopes

### 29. hotel-ts — Hotel booking (33 files)
- **Goal:** property catalog, room inventory, reservation lifecycle with
  date-range availability checks, guest profiles.
- **Feature slices:**
  - `hotels` → Hotel: properties + amenities
  - `rooms` → Room: inventory + rates
  - `reservations` → Reservation: booking + status flow
  - `guests` → Guest: profiles + history
  - `availability` → Availability: date-range checks

### 30. courier-ts — Courier delivery (33 files)
- **Goal:** last-mile logistics: courier roster, package registration, pickup
  scheduling, delivery status, live location tracking with realtime updates.
- **Feature slices:**
  - `couriers` → Courier: roster + availability
  - `packages` → Package: registration + labels
  - `pickups` → Pickup: scheduling + confirm
  - `deliveries` → Delivery: status + proof
  - `tracking` → TrackingEvent: live location log

### 31. wallet-ts — Digital wallet (33 files)
- **Goal:** fintech wallet: balance tracking, categorized transactions, peer
  transfers with idempotency, virtual cards, monthly statements.
- **Feature slices:**
  - `wallets` → Wallet: balances + currencies
  - `transactions` → Transaction: ledger + categories
  - `transfers` → Transfer: peer + idempotency
  - `cards` → Card: virtual + limits
  - `statements` → Statement: monthly export

---

## Python blueprints (FastAPI: routers → services → repositories → models)

### 3. cms-python — Multi-tenant CMS (25 files)
- **Goal:** content types, drafts, publishing workflow, media uploads, roles.
- **Reasoning:** Content management with FastAPI layering, per-feature slices,
  Alembic migrations, pytest beside services.
- **Feature slices:** tenants · content types · entries/drafts · publishing
  workflow · media · roles.

### 16. forum-python — Community forum (33 files)
- **Goal:** discussion platform: threads with posts, vote scoring, moderation
  queue.
- **Feature slices:**
  - `users` → User: accounts + reputation
  - `threads` → Thread: topics + tags
  - `posts` → Post: replies + pagination
  - `votes` → Vote: score calculation
  - `moderation` → Report: review queue

### 17. academy-python — E-learning platform (33 files)
- **Goal:** course platform: course/lesson hierarchy, enrollment, quiz
  grading, progress tracking.
- **Feature slices:**
  - `courses` → Course: catalog + instructors
  - `lessons` → Lesson: content + ordering
  - `enrollments` → Enrollment: access + completion
  - `quizzes` → Quiz: questions + grading
  - `progress` → ProgressRecord: per-course tracking

### 18. helpdesk-python — Help desk / support (33 files)
- **Goal:** support platform: ticket lifecycle, agent assignment, response
  threads, SLA policies, report queries.
- **Feature slices:**
  - `tickets` → Ticket: lifecycle + priority
  - `agents` → Agent: roster + assignment
  - `responses` → Response: thread + timestamps
  - `slas` → SlaPolicy: deadline rules
  - `reports` → Report: aggregate queries

### 19. estate-python — Real estate platform (33 files)
- **Goal:** property platform: listing lifecycle, agent profiles, saved
  search alerts, tour scheduling, favorites.
- **Feature slices:**
  - `listings` → Listing: lifecycle + photos
  - `agents` → Agent: profiles + listings
  - `searches` → SavedSearch: filters + alerts
  - `tours` → TourBooking: scheduling + confirm
  - `favorites` → Favorite: user shortlists

### 32. subsaas-python — Subscription platform (33 files)
- **Goal:** SaaS subscriptions: customer lifecycle, plan changes, recurring
  billing, failed-payment dunning workflow.
- **Feature slices:**
  - `customers` → Customer: accounts + contact
  - `plans` → Plan: tiers + prices
  - `subscriptions` → Subscription: states + upgrades
  - `payments` → Payment: recurring + retries
  - `dunning` → DunningCycle: failed-payment recovery

### 33. eventbook-python — Event booking (33 files)
- **Goal:** ticketing: event catalog, ticket types, order checkout with seat
  selection, attendee check-in.
- **Feature slices:**
  - `events` → Event: catalog + schedules
  - `tickets` → TicketType: pricing + inventory
  - `orders` → Order: checkout + status
  - `attendees` → Attendee: registrations + check-in
  - `seats` → SeatMap: sections + holds

### 34. smarthome-python — Smart home hub (33 files)
- **Goal:** home automation: device registry per protocol, room grouping, scene
  activation, rule-based automations, event audit log.
- **Feature slices:**
  - `devices` → Device: registry + state
  - `rooms` → Room: grouping + layout
  - `scenes` → Scene: one-tap presets
  - `automations` → Automation: trigger + actions
  - `logs` → EventLog: audit trail

### 35. fieldservice-python — Field service dispatch (33 files)
- **Goal:** service dispatch: technician roster, work-order lifecycle, schedule
  assignment, parts inventory, invoicing after completion.
- **Feature slices:**
  - `technicians` → Technician: roster + skills
  - `workorders` → WorkOrder: lifecycle + priority
  - `schedules` → Schedule: assignment + conflicts
  - `inventory` → InventoryItem: parts + stock
  - `invoices` → Invoice: billing after service

---

## C# blueprints (.NET solution: Api → Application → Domain → Infrastructure)

### 5. banking-csharp — Banking backend (26 files)
- **Goal:** accounts, transfers, a double-entry ledger, statements, audit
  logging.
- **Reasoning:** Financial core with .NET solution layering; transfers do a
  funds check with idempotency; the ledger is double-entry; audit log is
  append-only.
- **Feature slices:** accounts · double-entry ledger · transfers · statements ·
  audit log.

### 20. expense-csharp — Personal finance (34 files)
- **Goal:** finance manager: account tracking, categorized transactions,
  budget envelopes, report queries.
- **Feature slices:**
  - `accounts` → Account: balances + types
  - `transactions` → Transaction: categorized entries
  - `budgets` → Budget: envelopes + limits
  - `categories` → Category: taxonomy + rules
  - `reports` → Report: aggregate queries

### 21. hr-csharp — HR management (34 files)
- **Goal:** workforce platform: employee records, department org chart,
  time-off workflow, performance reviews, payroll runs.
- **Feature slices:**
  - `employees` → Employee: records + status
  - `departments` → Department: org hierarchy
  - `timeoffs` → TimeOffRequest: request workflow
  - `reviews` → PerformanceReview: cycles + scores
  - `payroll` → PayrollRun: runs + payslips

### 22. crm-csharp — CRM (34 files)
- **Goal:** sales CRM: contact/company records, deal stages in pipelines,
  activity logging.
- **Feature slices:**
  - `contacts` → Contact: records + tags
  - `companies` → Company: accounts + hierarchy
  - `deals` → Deal: stages + amounts
  - `activities` → Activity: interaction log
  - `pipelines` → Pipeline: stage definitions + order

### 23. clinic-csharp — Clinic management (34 files)
- **Goal:** medical practice: patient records, appointment scheduling, doctor
  roster, prescriptions, invoice billing.
- **Feature slices:**
  - `patients` → Patient: records + history
  - `appointments` → Appointment: scheduling + status
  - `doctors` → Doctor: roster + specialties
  - `prescriptions` → Prescription: medication + refills
  - `billing` → Invoice: charges + payments

### 36. payment-csharp — Payment processing (34 files)
- **Goal:** fintech core: merchant accounts, payment lifecycle, settlement
  batches, dispute handling, regulatory reporting.
- **Feature slices:**
  - `accounts` → MerchantAccount: onboarding + balances
  - `payments` → Payment: auth + capture
  - `settlements` → SettlementBatch: batch + transfer
  - `disputes` → Dispute: case + evidence
  - `reports` → Report: regulatory queries

### 37. teams-msg-csharp — Enterprise messaging (34 files)
- **Goal:** workplace messaging: team/channel hierarchy, message history,
  @mentions with notifications, full-text search.
- **Feature slices:**
  - `teams` → Team: org + membership
  - `channels` → Channel: topics + posts
  - `messages` → Message: send + edit + delete
  - `mentions` → Mention: notifications + digests
  - `search` → SearchIndex: full-text queries

### 38. membership-csharp — Membership management (34 files)
- **Goal:** gym/club membership: member records, tiered plans, renewal cycles,
  benefit entitlements, billing runs.
- **Feature slices:**
  - `members` → Member: records + status
  - `plans` → Plan: tiers + pricing
  - `renewals` → Renewal: cycles + reminders
  - `benefits` → Benefit: entitlements + usage
  - `billing` → BillingRun: charges + receipts

### 39. iot-csharp — Industrial IoT monitoring (34 files)
- **Goal:** industrial telemetry: sensor registry, high-frequency readings,
  threshold rules, alert dispatch, live dashboards.
- **Feature slices:**
  - `sensors` → Sensor: registry + calibration
  - `readings` → Reading: high-freq ingestion
  - `thresholds` → ThresholdRule: limits + windows
  - `alerts` → Alert: dispatch + ack
  - `dashboards` → Dashboard: charts + widgets

---

## Domain index (search by what the user asked for)

| User asks for… | Use blueprint |
|----------------|---------------|
| shop / store / e-commerce / checkout | ecommerce-go |
| analytics / dashboard / metrics | analytics-ts |
| CMS / blog / content / publishing | cms-python |
| social / feed / posts / friends | social-ts |
| bank / money / ledger / transfers | banking-csharp |
| chat / messaging / websocket / realtime | chat-go |
| game / matchmaking / leaderboard | gaming-ts |
| file storage / upload / sharing | filebox-go |
| url shortener / links / click tracking | shortlink-go |
| jobs / recruiting / hiring | jobboard-go |
| restaurant / POS / kitchen | kitchen-go |
| fitness / workouts / health | fitness-ts |
| project management / kanban / tasks | kanban-ts |
| music / streaming / playlists | stream-ts |
| news / rss / articles / feed aggregator | news-ts |
| forum / community / discussion | forum-python |
| learning / courses / e-learning | academy-python |
| support / helpdesk / tickets | helpdesk-python |
| real estate / property / listings | estate-python |
| finance / budget / expense tracking | expense-csharp |
| HR / employees / payroll | hr-csharp |
| CRM / sales / leads / deals | crm-csharp |
| clinic / hospital / patients | clinic-csharp |
| fleet / logistics / tracking | fleet-go, courier-ts |
| payment gateway / payments / merchant | paygate-go, payment-csharp |
| team chat / workspace messaging / slack | teamchat-go, teams-msg-csharp |
| subscriptions / billing / saas / dunning | subbilling-go, subsaas-python |
| iot / devices / telemetry / dashboards | iot-ts, iot-csharp, smarthome-python |
| hotel / booking / reservations | hotel-ts, eventbook-python |
| courier / delivery / last-mile | courier-ts |
| wallet / fintech / peer transfer | wallet-ts |
| field service / dispatch / work orders | fieldservice-python |
| membership / gym / club | membership-csharp |

---

## Blueprint anatomy (how every plan is composed)

Every blueprint above is generated from a spec with this recipe:

1. **4–6 feature slices** — each `(slug, Entity, blurb)` gets its own vertical
   slice: models + repository + service (+ handlers/routes/API) + tests.
2. **Shared layers** appended per language: entry point, config, middleware/DB,
   router, health check, README, build files (go.mod / package.json /
   requirements.txt / .sln).
3. **Contracts** — every planned file declares its `exports` and `uses`
   (which members it imports from which other planned file), so the generated
   program compiles by construction.
4. **One file = one responsibility** — 25+ files for these apps, never
   thousand-line monoliths.

Sources: `scripts/generate-large-program-examples.py` (BLUEPRINT_SPECS +
hand-authored constants) and `training/dataset/large-program-examples.jsonl`.
