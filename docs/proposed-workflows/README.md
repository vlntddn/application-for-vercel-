# Предложенный CI — как применить (SEC5)

`ci.yml` рядом — готовый workflow: текущий CI (тесты на Node 18/22, проверка
нулевых зависимостей, smoke-тест сервера) + джоб `e2e` (headless Chrome:
`qa-new-user.mjs` и `scripts/qa-ux.mjs --strict`), с минимальными правами
(`permissions: contents: read`) и действиями, закреплёнными по полному SHA.

Файл лежит в `docs/` (а не в `.github/workflows/`) намеренно: менять CI —
решение владельца, автоматические агенты CI не правят.

## Как применить

### Вариант 1 — правка файла в вебе GitHub (проще)

1. На GitHub откройте репозиторий → ветка `self-improve` (или `main`).
2. Создайте файл `.github/workflows/ci.yml` (кнопка «Add file» → «Create
   new file»), если его ещё нет; если есть — откройте его.
3. Вставьте сюда содержимое `docs/proposed-workflows/ci.yml` целиком.
4. Commit (commit message, напр., «CI: min permissions, pinned actions, e2e»).

### Вариант 2 — токеном с правом `workflow`

```sh
# PAT (Fine-grained) с правами: Contents: Read, Metadata: Read,
# Actions: Read and write, Workflow: Read and write.
gh api -X PUT \
  -f branch="self-improve" \
  -f message="CI: min permissions, pinned actions, e2e" \
  -f content="$(base64 -i docs/proposed-workflows/ci.yml)" \
  repos/vlntddn/application-for-vercel-/.github/workflows/ci.yml
```

(Имя репозитория с дефисом на конце — не опечатка.)

## Примечания

- `e2e` на `ubuntu-latest` берёт системный `google-chrome`
  (`CHROME_PATH=$(which google-chrome)`); локально/на другом раннере задайте
  `CHROME_PATH` вручную.
- SHA закреплений актуальны на 2026-10-04; при обновлении действий берите
  SHA тега через `git ls-remote https://github.com/actions/<имя> refs/tags/v*`
  в репозитории действия.
- После применения первый запуск CI увидит новый workflow сам; старый
  `.github/workflows/ci.yml` можно удалить, если он содержал те же джобы.
