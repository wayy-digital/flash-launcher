# Flash Launcher

Лаунчер для Minecraft: Java Edition. Ставит любые версии Mojang, Fabric, Forge, NeoForge и Quilt, моды и сборки модов с Modrinth, в нём есть редактор скинов. Интерфейс по умолчанию на русском, украинский включается в настройках. Вход — через Steam или гостем.

UI сделан на Tauri 2 + React. Движок — CLI из [gerdaroot/Horizon-Offline-Launcher](https://github.com/gerdaroot/Horizon-Offline-Launcher), он лежит рядом с программой как `flash-engine`. Сам Horizon (Rust) лаунчер не использует, вместо него запускается обычный Minecraft.

## Экраны

1. **Установка.** Версия Minecraft, загрузчик модов (Ваниль/Fabric/Forge/NeoForge/Quilt), Java, ярлык. По кнопке создаётся первая сборка.
2. **Вход.** Гостем: ник, классическая или тонкая модель, свой скин PNG. Или через Steam: имя и аватар из профиля.
3. **Лаунчер.**
   - Главная: кнопка «Играть», выбор сборки, активность за неделю, статистика, топ сборок.
   - Версии Minecraft: все релизы, снапшоты, beta/alpha.
   - Мои сборки.
   - Моды и Сборки модов (Modrinth). Сборка ставится как отдельная Java-сборка из `.mrpack`.
   - Редактор скинов.
   - Журнал игры.
   - Настройки: память, язык, аккаунт Steam.

## Вход: Steam или гость

- **Steam.** Работает через Steam OpenID 2.0: лаунчер открывает steamcommunity.com в браузере, ответ приходит на локальный порт `127.0.0.1`, а подпись проверяется у самого Steam (`check_authentication`). Имя и аватар берутся из публичного профиля. Ключ Steam Web API не нужен.
- **Гость** — просто ник.
- **Друзья Steam.** Отдельная страница в лаунчере: кто из друзей в сети и во что играет. На иконке — счётчик друзей онлайн. Данные приходят через свой API лаунчера на Vercel (`flash-launcher-api`, команда WAYY Pro) — только там лежит ключ Steam Web API (`STEAM_API_KEY`). В самом лаунчере ключа нет.
- В обоих случаях игра идёт под офлайн-ником: одиночная игра, LAN и серверы с `online-mode=false`.

**Ограничение.** Входа Microsoft в лаунчере нет. Mojang отдаёт файлы Minecraft только аккаунту Microsoft с лицензией, поэтому Flash Launcher их не скачивает. Моды и сборки модов ставятся, но «Играть» сработает только для версии, файлы которой уже лежат в папке движка (`~/.local/share/horizon/minecraft` или `%APPDATA%`). Иначе лаунчер так и пишет: файлов этой версии нет.

## Обновления лаунчера

Лаунчер проверяет обновления на `https://flash-launcher-api.vercel.app/api/update` при каждом запуске и потом каждые 30 минут.

- **Пока лаунчер открыт.** Если вышла новая версия, сверху появляется кнопка «Вышло обновление X». По ней открывается окно со списком изменений и кнопкой «Обновить и перезапустить».
- **При запуске.** Если игрок пропустил обновление, лаунчер ставит его сам и перезапускается. Это можно выключить: «Настройки → Обновления лаунчера → Спрашивать». Тогда при запуске будет только кнопка.
- **Подпись.** Каждое обновление подписано ключом WAYY (minisign). Неподписанную или подделанную сборку лаунчер не поставит. Публичный ключ лежит в `tauri.conf.json`, приватный — в `flash-updater.key`. Храните его отдельно и не кладите в git: без него выпустить обновление нельзя.
- **Системы.** Windows обновляется через NSIS-установщик (тихо, без UAC), Linux — через AppImage или .deb.

### Как выпустить новую версию

Всё делает GitHub Actions (`.github/workflows/release.yml`):

1. Поднимите `version` в `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` и `package.json`. Напишите, что нового, в `release-notes.md`.
2. Закоммитьте, затем `git tag v0.4.1 && git push origin main v0.4.1`.
3. Actions собирает Windows (NSIS `.exe`) и Linux (AppImage, `.deb`), подписывает их ключом из секрета `TAURI_SIGNING_PRIVATE_KEY` и публикует GitHub Release.
4. Затем Actions записывает `server/releases.json` в `main`. Vercel (проект `flash-launcher-api`, корень `server`) деплоит его сам, и лаунчеры видят обновление.

Вручную, без Actions: `tools/release.mjs` (см. комментарий в файле).

## Сборка

Нужны Rust ≥ 1.95 и Node 20+.

```sh
git clone https://github.com/gerdaroot/Horizon-Offline-Launcher
cd Horizon-Offline-Launcher
git apply ../flash-launcher/patches/engine.patch   # системные сертификаты + фикс импорта .mrpack
cd launcher && cargo build --release
```

**Linux.** Сначала установите пакеты:

```
libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxkbcommon-x11-dev libwayland-dev libx11-xcb-dev libfontconfig-dev libvulkan-dev libasound2-dev
```

```sh
cp Horizon-Offline-Launcher/launcher/target/release/horizon-launcher flash-launcher/src-tauri/binaries/flash-engine-x86_64-unknown-linux-gnu
cd flash-launcher && npm install && npx tauri build --bundles deb appimage
```

**Windows.** Нужны Visual Studio Build Tools с «Desktop development with C++».

```powershell
cd Horizon-Offline-Launcher\launcher; cargo build --release
copy target\release\horizon-launcher.exe ..\..\flash-launcher\src-tauri\binaries\flash-engine-x86_64-pc-windows-msvc.exe
cd ..\..\flash-launcher; npm install; npx tauri build --bundles nsis
```

Установщик появится в `src-tauri\target\release\bundle\nsis\Flash Launcher_0.2.0_x64-setup.exe`.

## Что проверено (Linux, без видеокарты)

| Проверка | Результат |
|---|---|
| Установка: сборка Fabric 26.3 создана и выбрана | ✅ |
| Вход гостем, ник и скин записаны в движок | ✅ |
| Вход Steam: адрес принят (страница Sign In на steamcommunity.com), поддельный ответ отклонён проверкой Steam | ✅ настоящим аккаунтом не проверено — нужен ваш логин |
| Сборка модов Fabulously Optimized с Modrinth → Java-сборка: Minecraft 26.3, Fabric 0.20.1, 47 модов | ✅ |
| Мод Sodium в эту сборку, контрольная сумма sha512 проверена | ✅ |
| «Играть» без файлов Minecraft | ⛔ лаунчер пишет, что файлов нет и сам он их не скачивает |

## Изменения в движке (`patches/engine.patch`)

- `ureq` с `native-certs`: движок доверяет системным сертификатам (корпоративные прокси, антивирусы).
- `import.rs`: папки внутри `.mrpack` (`overrides/`) больше не пишутся как файлы. Из-за этого импорт Fabulously Optimized и других сборок падал с ошибкой «Is a directory (os error 21)».
