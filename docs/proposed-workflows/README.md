# Предлагаемый CI (SEC5)

`ci.yml` здесь — готовая замена `.github/workflows/ci.yml`. Агенты не правят
`.github/` (у их токенов нет права `workflow`, пуш падает), поэтому файл
применяет владелец.

## Что меняется по сравнению с текущим CI

- `permissions: contents: read` — токен джобов только читает код; писать в
  репозиторий, issues или пакеты он не может, даже если в CI попадёт чужой код.
- `persist-credentials: false` у checkout — токен не остаётся в `.git/config`
  на раннере.
- Шаг «Secret scan» — тот же сканер, что в `scripts/verify.sh`
  (`scripts/scan-secrets.mjs`), по всем файлам репозитория.
- `timeout-minutes: 20` у e2e — зависший Chrome не съедает 6 часов.
- Джобы `test` (Node 18 и 22), `smoke` и `e2e` (`qa-new-user.mjs`,
  `qa-ux.mjs --strict`, `CHROME_PATH`) остались как были.

## Закрепить действия по SHA (сделать один раз)

Тег `@v4` автор действия может передвинуть на другой код; SHA — нет. В файле
у каждой строки `uses:` стоит пометка `# PIN`. Чтобы получить SHA:

```sh
git ls-remote https://github.com/actions/checkout refs/tags/v4
git ls-remote https://github.com/actions/setup-node refs/tags/v4
```

и заменить `@v4` на `@<40 символов SHA> # v4`. (Агент SHA не подставил: ему
нельзя обращаться к чужим репозиториям, а придуманный SHA сломал бы CI.)

## Как применить

**Через сайт GitHub (проще):** открыть `.github/workflows/ci.yml` в репозитории →
карандаш «Edit» → вставить содержимое `docs/proposed-workflows/ci.yml` → Commit.

**Из терминала:** нужен токен с правом `workflow` (classic) или с разрешением
«Workflows: Read and write» (fine-grained):

```sh
cp docs/proposed-workflows/ci.yml .github/workflows/ci.yml
git commit -am "ci: минимальные права, secret scan, таймаут e2e (SEC5)"
git push
```
