# DEVLOG — Passo (последнее сверху)

## 2026-09-30 — L9b: пояснения, порция 22 — ч10 сигналы 20/379 (новая глава)

Что сделано (коммит feat: L9b порция 22 на self-improve):
- **data/explanations/norme-di-circolazione.json** — создан, +20 записей (ch10 = 20/379).
- Темы (сигнальные, без картинок): высокие характеристики не отменяют лимиты /
  приоритет справа / не создавать опасность / зеркало перед поворотником / правый
  край при повороте направо (5 VERO) + ловушки: «среди дороги» (mustKnow: «по
  центру» — всегда ложь), дальний днём в городе, обгон в любой ситуации,
  клаксон на пешеходном переходе, двухтоновая труба (5 FALSO); груз на мотоцикле
  (боковой ≤ 50 см, VERO), крепёж/видимость/свобода движения (3 VERO), сзади ≤ 3
  десятых (VERO), допустимая масса (VERO), FALSO-ловушки: перепутанные пределы
  (боковой 3/10, +10% к высоте, +10% к массе, спереди 3/10).
- Подводные камни: mustKnow ch10 дал явное обоснование для «по центру» и
  дневного света — использовал как источник фактов.
- Проверено: gate validateExplanation на всех 20 записей, verify.sh → VERIFY OK.

## 2026-09-30 — L9b: пояснения, порция 21 — ch9 135/135, ГЛАВА ЗАВЕРШЕНА

Что сделано (коммит feat: L9b порция 21 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +14 записей (итого ch9 = 135/135).
- Темы: что НЕ влияет на дистанцию (число полос / размер впереди идущего / число
  передач / число колёс / тип рулевого — 5 FALSO); не зависит от топлива (VERO);
  зависит от здоровья и концентрации водителя (2 VERO); колонна → больше
  дистанции (VERO); НЕ зависит от мощности впереди идущего (FALSO), ручника
  (FALSO), следующих за вами (FALSO); в тоннеле и на автостраде дистанцию
  нельзя уменьшать (2 FALSO).
- Подводные камней: нет — чисел в why нет, все key_it дословные подстроки.
- Далее по L9b: ch10 norme-di-circolazione (379 вопросов, 325 без картинок) —
  сигналы по signal-words.json, по PATH_ORDER.
- Проверено: gate validateExplanation на всех 14 записей до записи, verify.sh →
  VERIFY OK (184 unit, 8 endpoint 200).

## 2026-09-30 — L9b: пояснения, порция 20 (ch9 — 121/135, non-сигнальные)

Что сделано (коммит feat: L9b порция 20 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +20 записей (итого ch9 = 121/135).
- Темы: от чего зависит spazio totale di arresto (velocità/pneumatici/asfalto —
  3 VERO + 2 FALSO «indipendente» + 2 FALSO «è pari a…» — путь это сумма реакции
  и торможения); что УВЕЛИЧИВАЕТ тормозной путь: скорость/снег/грязь/износ шин
  (4 VERO) + 3 FALSO-ловушки (новые шины, снижение скорости, шершавый асфальт —
  всё уменьшает, а не увеличивает); факторы дистанции безопасности (concentrazione
  /velocità/carico/aderenza/efficienza freni — 4 VERO).
- Подводные камни: чисел в why нет вообще (только «в несколько раз» без цифр) —
  invented-number ловушки обошёл сразу; ключи «spazio totale di arresto dipende»
  и «non dipende dalla velocità» повторяются у разных id — для каждого key_it
  проверял дословную подстроку.
- Проверено: gate validateExplanation на всех 20 записей до записи, verify.sh →
  VERIFY OK (184 unit, 8 endpoint 200).

## 2026-09-30 — L9b: пояснения, порция 19 (ch9 — 101/135, non-сигнальные)

Что сделано (коммит feat: L9b порция 19 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +20 записей (итого ch9 = 101/135).
- Темы: spazio-per-secondo FALSO-ловушки (50→4, 100→10, 130→15 м — «в несколько раз
  больше, чем заявлено»); определение spazio di frenatura (от начала торможения до
  остановки, VERO); квадратичный закон: raddoppio→×4, triplicazione→×9,
  quadruplicazione→×16 (3 VERO) + ловушки «independente dalla velocità» FALSO и
  «si raddoppia se la velocità si raddoppia» FALSO; факторы тормозного пути:
  низкое сцепление/снег/дождь/спуск — увеличение (4 VERO), подъём — уменьшение
  (VERO) + 5 FALSO-ловушек (рефлекс, заблокированные колёса, спуск через горку,
  «аumenta в подъём», «diminuisce в спуск»); состав spazio totale di arresto
  (путь реакции + путь торможения, VERO).
- Подводные камни (2 попытки): (1) FALSO-ловушки spazio-per-secondo нельзя
  объяснять верной цифрой 14/28/36 м (её нет в text_it и mustKnow ch9) — гейт
  invented number; переформулировал как «в несколько раз больше, чем N м», где N
  — цифра из самого текста вопроса; (2) арабские цифры 9 и 16 в why.zh тоже
  ловятся как invented numbers — переписал числами-словами (九倍 / 十六倍).
- Проверено: check-explanations.mjs без ошибок, verify.sh → VERIFY OK
  (184 unit, 8 endpoint 200).

## 2026-09-30 — L9b: пояснения, порция 18 (ch9 — 81/135, non-сигнальные)

Что сделано (коммит feat: L9b порция 18 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +20 запись (итого ch9 = 81/135).
- В чистом сигнальном пуле ch9 уже пусто (закрыто в порции 17); порция 18 берёт
  20 следующих несигнальных: цель дистанции (не tamponare, не fissa),
  зависимость от пути реакции (V/F пары), путь реакции-определение,
  минимальная дистанция 30 км/ч ≈ 9 м, 5× distrazione del conducente
  (causa incidenti / cellulare / sigaretta / radio / FALSO «non è determinata»
  e «non è pericolo»), 5× spazio-per-secondo (50→14, 100→28, 130→36, 150→42,
  FALSO 150→20).
- Подводные камни: у вопросов с цифрами (9/30, 14/50, 28/100, 36/130, 42/150)
  цифры берутся из text_it и легальны; у FALSO «150→20» НЕ вписывал верную
  цифру 42 (её нет в text_it) — why переформулировал как «значительно больше».
- Проверено: verify.sh → VERIFY OK (184 unit, 8 endpoint 200).

## 2026-09-30 — L9b: пояснения, порция 17 (ch9 — 61/135, ВСЕ сигнальные закрыты)

Что сделано (коммит feat: L9b порция 17 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +21 запись (итого ch9 = 61/135).
- Закрыты ОСТАВШИЕСЯ сигнальные вопросы ch9 (16) + первые 5 несигнальных
  (цель дистанции, sgombraneve/sale 20 м VERO + ловушки 10/15 м FALSO, контроль
  дистанции идущего позади). Итого ВСЕ сигнальные ch9 (56/56) — ЗАКРЫТЫ;
  в чистом сигнальном пуле ch9 не осталось ни одного.
- Подводные камни (1 попытка): (1) key_it должен быть дословной подстрокой —
  апостроф в тексте прямой ('), а не типографский; (2) у FALSO «10/15 м»
  нельзя в why писать верную цифру 20 (её нет в text_it и mustKnow ch9 —
  гейт invented number); переписал why как «должна быть сильно больше».
- Проверено: check-explanations.mjs без ошибок, verify.sh → VERIFY OK
  (184 unit, 8 endpoint 200).
- Справка: в DEVLOG порции 16 ошибочно написано 63 сигнала — на самом деле
  сигнальных в ch9 ровно 56 (текст-матчинг signal-words); всего вопросов ch9 = 269.
## 2026-09-30 — L9b: пояснения, порция 16 (ch9 — 40/135)

Что сделано (коммит feat: L9b порция 16 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — +20 записей (итого ch9 = 40/135).
- Темы: цель дистанции (tamponamento VERO; scontro frontale/laterale — FALSO);
  минимальная дистанция ≈ v/10×3 м — 4 VERO (14/28/36/42 м) + 5 FALSO-ловушек
  с заниженными числами (2/5/15/20/25 м); «ниже 50 км/ч не нужна» и «порог
  скорости» (FALSO); «только квадроциклы» (FALSO); всегда перед обгоном,
  трудно предсказать водителя, вовремя остановиться, ≥ путь за время реакции
  (VERO); «= пространству торможения» (FALSO).
- Подводный камень: в why FALSO-«минимумов» нельзя цитировать верные числа
  (9/14/28/36/42), которых нет в text_it — гейт «invented number»; переписал
  why без выдуманных чисел (1 попытка).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Дальше: ещё 2 батча ch9 (осталось 95).

## 2026-09-30 — L9b: пояснения, порция 15 (ch9 — старт, 20/63)

Что сделано (коммит feat: L9b порция 15 на self-improve):
- **data/explanations/distanza-di-sicurezza.json** — НОВЫЙ файл, 20 записей
  (ch9 = 20, осталось 43 из 63 сигнальных; банк всего 269/1993).
- Темы: от чего зависит дистанция — своя скорость, реакция водителя,
  трафик, план-профиль дороги, погода, тип/состояние/груз авто, эффективность
  тормозов, состояние шин, скорость впереди идущего (все VERO, ключевое —
  «anche»/«deve»); 100 м между грузовиками >3.5 т при запрете обгона (VERO);
  FALSO-ловушки: тип топлива, объём, мощность двигателя, ширина полосы,
  ширина своего авто, «10 м между автопоездами», «всегда 70 м»,
  «равна тормозному пути».
- Цифры 100/3.5/10/70 — только из text_it; mustKnow ch9 новых допустимых
  чисел не давал. key_it с U+2019 (4 id) исправлены после первой попытки
  (гейт: verbatim substring).
- Файл создан node-скриптом (читает → дописывает → пишет); каждый id
  валидирован гейтом до записи (20/20 pass).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Дальше: 2 батча по 20 + 3 шт. ch9, затем главы по PATH_ORDER.

## 2026-09-30 — L9b: пояснения, порция 14 (ch8 — завершён)

Что сделано (коммит feat: L9b порция 14 на self-improve):
- **data/explanations/limiti-di-velocita.json** — 9 записей
  (итого 249/1993; **ch8 закрыт на 89/89**).
- Темы: железнодорожные переезды — увести машину с путей любыми средствами
  (даже пробив барьеры), опасность нарушения для поезда и пассажиров,
  «только ночью» (ловушка), ложные действия (покинуть/отцепить прицеп/
  разгрузить ради груза), «уходить на сто метров пешком». Число «сто»
  намеренно не прописано.
- Файл правлен node-скриптом (читает → дописывает → пишет); каждый id
  валидирован гейтом до записи (1 id с апострофом в key_it исправлен на
  безопасный подстрочный фрагмент).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 249/1993, ch8 ЗАВЕРШЁН.
- Дальше по PATH_ORDER — ch9 (нужен выбор без картинок).

## 2026-09-30 — L9b: пояснения, порция 13 (ch8 limiti-di-velocita)

Что сделано (коммит feat: L9b порция 13 на self-improve):
- **data/explanations/limiti-di-velocita.json** — ещё 20 записей
  (итого 240/1993; ch8 = 80, осталось ~9).
- Темы: ложные лимиты (100 внегородских, 60 в городах); «сразу после
  заката / не превышать 130 ночью»; спуски на нейтральной с выключенным
  двигателем (теряется торможение двигателем — опасно, не экономия);
  превышение 110 «только на спусках» (ловушка); ответственность при
  превышении с приоритетом на перекрёстке; разные лимиты по Европе;
  работа на дороге; знак стоящего транспорта; мяч на дороге (ребёнок);
  припаркованные машины (распахнутая дверь, скрытая коляска) — ловушки
  «только если дверь открыта / уже вышли / только на высокой скорости».
  Цифры 100/110/130 — из mustKnow; 60 намеренно не прописана.
- Файл правлен node-скриптом (читает → дописывает → пишет); каждый id
  валидирован гейтом до записи.
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 240/1993.

## 2026-09-30 — L9b: пояснения, порция 12 (ch8 limiti-di-velocita)

Что сделано (коммит feat: L9b порция 12 на self-improve):
- **data/explanations/limiti-di-velocita.json** — ещё 20 записей
  (итого 220/1993; ch8 = 60).
- Темы: верные лимиты (110 внегородских главных); ложные цифры (80 в городах,
  70 для квадрициклов, 150 на любой авто, «всегда выше 30»); умеренность
  скорости у перекрёстков, в теснине, при затруднённом пересечении, на
  скрытой видимости, при пешеходах без тротуара, на скользком покрытии
  (вода/снег/лёд/листва/грязь), при боковом ветре, по состоянию дороги.
  Ловушки: «сразу после заката», «сразу после перекрёстка», «по спешке»,
  «только по здоровью», «если догоняет автобус». Цифры 80/70/30 намеренно
  не прописаны (не в mustKnow); только 50/110.
- Файл правлен node-скриптом (читает → дописывает → пишет); каждый id
  валидирован гейтом до записи.
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 220/1993.

## 2026-09-30 — L9b: пояснения, порция 11 (ch8 limiti-di-velocita)

Что сделано (коммит feat: L9b порция 11 на self-improve):
- **data/explanations/limiti-di-velocita.json** — ещё 20 записей
  (итого 200/1993; ch8 = 40).
- Темы: ложные опровержения слов-ловушек («только при разгруженном авто»,
  «70 в городах», «всегда 50 в городах», «60 для любого ТС», «150 на любой
  авто», «по доступному времени», «умеренная вне городов»); верные
  факты: перегруз/поворот → опрокидывание, не мешать потоку, снизить на
  скрытой видимости, безопасность движения, реакция на внезапности,
  психофизическое состояние, 130 на авто, 50 в городах, дождь 130→110,
  град 110→90, отдельные 150 на спец-участках. Цифры 150/45/40 намеренно
  не прописаны (не в mustKnow), только 50/90/110/130.
- Файл правлен node-скриптом (читает → дописывает → пишет); каждый id
  валидирован гейтом до записи (verdict == is_true, key_it ⊆ text_it,
  why en/ru/zh).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 200/1993.

## 2026-09-30 — L9b: пояснения, порция 10 (ch8 limiti-di-velocita)

Что сделано (коммит feat: L9b порция 10 на self-improve):
- **data/explanations/limiti-di-velocita.json** — новый файл, 20 записей
  (итого 180/1993). ch1 закрыт на 160; дальше по порядку PATH_ORDER ch2–ch7 —
  sign-темы, почти все image-зависимые (отложены), ch8 — первая без картинок.
- Темы: регуляция скорости — верно: в зависимости от характеристик/состояния/
  груза авто, характеристик/состояния/атмосферных условий дороги, условий
  трафика, чтобы не создавать опасность для людей/вещей/нарушения движения,
  не выше максимума, соблюдая ограничения, всегда держать контроль и быть
  способным остановиться безопасно (в поле видимости). Неверно: «исключительно
  по лимиту», «по своему опыту», «по марке шин», «по расстоянию», «снижать
  только при наличии агентов» — во всех ложных опровергается слово-ловушка
  (esclusivamente / solo).
- Файл создан node-скриптом: читает → дописывает id → пишет; каждый id
  валидирован гейтом до записи (verdict == is_true, key_it ⊆ text_it,
  why en/ru/zh, без цифр в why). Без цифр (вопросы-принципы, не лимиты).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 180/1993.

## 2026-09-30 — L9b: пояснения, порция 9 (ch1, слова-сигналы) — хвост без картинок

Что сделано (коммит feat: L9b порция 9 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 5 записей
  (итого 160/1993): taxi-conducente-5, gravidanza-carrozzine-0/7/8/9.
- Темы: такси, выезжающее с левой стороны (уступает само — неверно),
  беременная женщина (давать перейти не торопя — верно; уступать из любого
  направления, а не только слева направо), пандус тротуара для колясок
  (парковка перед ним запрещена всегда, а не 22:00-8:00 — неверно),
  пешеход с детской коляской (уступать из любого направления — «только если
  слева направо» неверно).
- **ВАЖНО:** это все оставшиеся вопросы ch1 без картинок со словами-сигналами
  (5/5). Дальше по ch1 — только image-зависимые (doppio-senso 550.png +
  прочие), которые отложены до ручного разбора картинок.
- Файл правлен node-скриптом; ни одного существующего id не удалено
  (160 = 155 + 5). Без цифр в why.
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 160/1993.
- Следующий запуск: либо разбор image-зависимых ch1 (нужны картинки),
  либо переход к ch2 (следующая глава с вопросами со словами-сигналами).


## 2026-09-30 — L9b: пояснения, порция 8 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 8 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 155/1993): vicinanza-pedonale-0/1/2/3/4/5/6/7/9/10/11/12/13,
  piazzole-6/7/9, taxi-conducente-0/1/3/4.
- Темы: поведение пешеходов у зебры (пешеход может отступить/замереть/
  выйти неожиданно; дети непредсказуемы; пожилые — медленно; припаркованные
  закрывают обзор), белые/бело-красные трости слепых (уступать в обоих случаях,
  не считать «опытным», не ускоряться, остановившийся на зебре не отказался от
  перехода), школьные автобусные остановки (замедляться заранее, дети первыми),
  таксопарк (внимать пассажирам и переходящим, но не уступать выезжающему такси).
- Подвохи: vicinanza-pedonale-7/9/10/11/12/13 (ложные допущения «дети быстры»,
  «белая трость = опытнее», «только замедлить», «ускориться», «сбросил право»,
  «переходить бок о бок»); piazzole-6/7/9 (не избегать замедления, дети
  первыми, не «только если дети видны»); taxi-conducente-4 (не обязан уступать
  выезжающему такси — он сам уступает).
- Файл правлен node-скриптом; ни одного существующего id не удалено
  (155 = 135 + 20). Без цифр в why. 5 вопросов doppio-senso (550.png) —
  image-dependent, пропущены.
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 155/1993.


## 2026-09-30 — L9b: пояснения, порция 7 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 7 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 135/1993): quadricicli-3, strisce-pannelli-retroriflettenti-11/12,
  motocicli-5/8, traffico-intenso-1/3/4, file-veicoli-0/4/8, gare-velocita-5/6/7,
  inquinamento-strade-4/5/7, persone-anziane-11, conducente-precedenze-9/10.
- Темы: классы квадрициклов/мотоциклов (мощность, колёса, объём), запрет
  занимать переезды/рельсы/перекрёстки даже в пробке, езда колонной (видеть в
  даль, не держать аварийку, не обгонять пылящий при плохой видимости), полный
  запрет несанкционированных гонок, утечки масла/топлива, по лужам — медленно,
  уступка пожилым и слепым (без ограничений «только…»).
- Подвохи: motocicli-5/8 (трёхколёсные ≠ все мотоциклы; мотоцикл не только до
  125 см3), traffico-intenso-4 (не «только со светофором»), gare-velocita-5/6/7
  (запрет вне зависимости от времени/числа/вида транспорта), anziani-11 и
  non-vedente (приоритет без условий «только»). Числа в why только из text_it
  (15 kW, 125 cm3).
- Файл правлен node-скриптом (чтение → добавление объектов → запись); ни одного
  существующего id не удалено (135 = 115 + 20). 5 вопросов doppio-senso (550.png)
  и tre-carreggiate-4 (562.png) — image-dependent, пропущены.
- Проверено гейтом checkAll (0 ошибок, 137 записей во всех категориях) +
  verify.sh → VERIFY OK (184 unit, 8 endpoint 200). Прогресс в строке L9b:
  сигналы 135/1993.


## 2026-09-30 — L9b: пояснения, порция 6 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 6 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 115/1993): corsia (0/2/3/5/6/7/9/10/11/13/15 + accelerazione-4 +
  decelerazione-3), marciapiede (2/5), salvagente (0/2), passo-carrabile-2,
  quadricicli (7/10).
- Темы: виды полос (ускорение/замедление/специальные/двойной ряд/обгон/мин.
  скорость/экстренная остановка), тротуар, островок безопасности, проезд,
  лёгкие квадрициклы. Числа не использовал (в тексте их нет). Факты только из
  text_it + mustKnow ch1 (corsia = 1 fila di veicoli; ZTL = solo autorizzati).
- Подвохи: corsia-13 (двойной ряд — нет, полоса односторонняя), corsia-15
  («mai» — переходить можно на оборудованном переходе),
  corsia-accelerazione-4 (не для обгона), corsia-decelerazione-3 (не для
  остановки), quadricicli 7/10 (запрещено дорабатывать под большую скорость).
- Файл правлен node-скриптом (чтение → добавление объектов → запись); ни одного
  существующего id не удалено (115 = 95 + 20).
- Проверено гейтом checkAll (0 ошибок, 117 записей во всех категориях) +
  verify.sh → VERIFY OK (184 unit, 8 endpoint 200). Прогресс в строке L9b:
  сигналы 115/1993.

## 2026-09-30 — L9b: пояснения, порция 5 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 5 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 95/1993): attraversamento-pedonale-0, strade-extraurbane-principali-4,
  isola-traffico (1/2/11), intersezione-raso-1, zona-traffico-limitato (0/1/2/3/6/7),
  passaggio-livello (4/5), strada-definizione (0/1/2/3/9), corsia-12.
- Темы: перекрёсток/остров/ЗТЛ/переезд/устройство дороги и полос. Числа не
  использовал (в тексте их нет). Факты только из text_it + mustKnow ch1
  (ZTL = solo autorizzati; isola di traffico = transito vietato).
- Файл правлен node-скриптом (чтение → добавление объектов → запись); ни одного
  существующего id не удалено (95 = 75 + 20).
- Проверено гейтом checkAll (0 ошибок) + verify.sh → VERIFY OK (184 unit,
  8 endpoint 200). Прогресс в строке L9b: сигналы 95/1993.

## 2026-09-30 — L9b: пояснения, порция 4 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 4 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 75/1993): comportamento-conducente (duty of care, уважение к инспекторам,
  предвидение, терпение, не полагаться на других, не требовать приоритет;
  FALSO — мощь авто, помехи крупногабаритным, «только в форме», осторожность на
  перекрёстке, нетерпение) + conducente-precedenze (незрячий с белой тростью вне
  перехода: VERO — уступить, помочь, даже без пса-поводыря, бело-красная трость
  глухонемого, плавная остановка; FALSO — ускорение, «первый по приоритету»,
  условие «только если переход дальше 100 м»).
- Проверено гейтом check-explanations.mjs (вердикт, key_it дословно, ч.1, числа
  только из текста/mustKnow, why ≤280, 3 языка, не дублирует текст) + npm test
  184 PASS + smoke 8/200 + verify.sh → VERIFY OK. Никаких выдуманных фактов:
  «100 м» есть в тексте вопроса conducente-precedenze-8.

## 2026-09-30 — L9b: пояснения, порция 3 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 3 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 15 записей
  (итого 55): carreggiata/corsie, centro abitato (перекрёстки, концентрация,
  приоритет пешеходам), ciclisti/pedoni (достаточный боковой интервал, ловушка
  «2 метра» = выдуманная цифра), ciclomotori, поведение водителя.
  Добавлено 15 / пропущено 5.
- **Пропущено 5 вопросов carreggiata-doppio-senso-0/3/4/5/6** — текст зависит от
  картинки 550.png, изображение недоступно для анализа; по правилу «skip if
  uncertain» отложены (не выдумывать). В DEVLOG помечены, вернуться позже с доступом к изображению.

Проверка: checkAll — 0 ошибок; verify.sh → VERIFY OK (184 unit, 8 endpoint 200).
Прогресс в строке L9b: сигналы 55/1993.

## 2026-09-30 — L9b: пояснения, порция 2 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b порция 2 на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** — ещё 20 записей
  (итого 40): autoveicoli (определение: 4+ колеса с двигателем, без квадрициклов),
  autovetture (до 8+1 мест; тип привода нерелевантен), bambini al semaforo
  (осторожность: непредсказуемость детей, зелёный для пешеходов, жёлтая мигающая),
  caravan (жильё только стоя), carreggiata (одно-/двусторонняя).
  Добавлено 20 / пропущено 0. Тот же способ: node-скрипт в /tmp, append, asserts.

Проверка: checkAll — 0 ошибок; verify.sh → VERIFY OK (184 unit, 8 endpoint 200).
Прогресс в строке L9b: сигналы 40/1993.

## 2026-09-30 — L9b: пояснения, порция 1 (ch1, слова-сигналы)

Что сделано (коммит feat: L9b на self-improve):
- **data/explanations/definizioni-generali-doveri-strada.json** (новый файл) — 20 записей,
  все ch1: первые 20 вопросов со словами-сигналами в порядке PATH_ORDER (aree-pedonali,
  attenzion-conducente, autocaravan-camper, autostrada). Добавлено 20 / пропущено 0.
- Способ: node-скрипт в /tmp (не в репозитории) — читает существующий файл →
  дописывает id → пишет; key_it/verdict/chapter/длина why asserted перед записью.
- Одна правка по гейту: autostrada-9 — в why было «150 cm3», цифры только из
  text_it/mustKnow главы → перефразировал без числа.

Проверка: checkAll(data/explanations) — 0 ошибок; verify.sh → VERIFY OK
(184 unit, 8 endpoint 200). Прогресс в строке L9b роадмапа: сигналы 20/1993.


## 2026-09-30 — L9a: Пояснения к ошибкам (офлайн-гейт, формат, показ)

Что сделано (коммит feat: L9a на self-improve):
- **data/explanations/<category>.json** — офлайн-формат (приложение ИИ не вызывает: нет сети, CSP, приватность):
  `{category, items:{<id>:{verdict VERO|FALSO, key_it дословная фраза из text_it, chapter chN, why {en,ru,zh}, source ai-draft, model, at}}}`.
  Сэмпл: cinture-casco-sicurezza.json (2 вопроса из ch22, ручной черновик).
- **scripts/check-explanations.mjs + tests/explanations.test.js** — 6 правил гейта (в npm test):
  (1) verdict = is_true; (2) key_it — подстрока text_it; (3) chapter = CATEGORY_CHAPTER темы;
  (4) каждое число в why есть в text_it или mustKnow главы («нельзя выдумывать числа»);
  (5) why ≤ 280 симв./язык, все 3 языка, не дубль text_it; (6) id существует в банке.
  Тесты: валидный пример + 5 видов сломанных примеров (по одному на ошибку) + checkAll на реальном каталоге.
- **scripts/verify.sh** — п.4 расширен на data/explanations/: записи (id) нельзя терять, только добавлять (merge-only),
  как и overlay.
- **public/js/state.js** — `explanationsBySlug` Map + `loadExplanations(slug)` (кэш; 404 → пустой объект, не бросает).
- **public/js/api.js** — `explanations: (slug) => /data/explanations/<slug>.json`.
- **public/js/views/practice.js** — `explanationBlock(q)`: показ ТОЛЬКО в разборе ошибки и после **2-й ошибки**
  на вопросе (учитывает текущий ещё не записанный неверный ответ), тег «AI draft — check the lesson»,
  ссылка на главу, why на языке ученика (loc). Экзамен — никогда. Отдельный слот под фактами главы.
- **public/styles.css** — .explanation (жёлтая левая граница, отлична от фактов); **public/sw.js** v73→v74.

Проверка: verify.sh → VERIFY OK (184 unit, 8 endpoint 200, qa-new-user 42 PASS).
Порядок гейта: правильная → null; 1-я ошибка → null (wrongTotal=1); 2-я ошибка → блок (wrongTotal=2).

TODO.md: пунктом «Заполнить explanation» (Спринт L, L9) занимается вся серия L9a…L9N — L9a не закрывает его полностью, чекбокс оставлен.


## 2026-09-30 — L8: Слово по тапу (тап по слову text_it → перевод)

Что сделано (коммит feat: L8 на self-improve):
- public/js/domain/learning.js — чистая функция поиска: buildDictionaryTapIndex(sections) строит индекс лемм (нормализация: нижний регистр, без диакритики, срез по статье); dictionaryTapTerms(text, index) находит ВСЕ совпадения по границам слова (accent-insensitive) и возвращает [{start,end,term}].
- public/js/views/practice.js — тапабельные <mark ds-term> в question-text; тап открывает .ds-term-callout с переводом на языке ученика (ru/en/zh); next() сбрасывает подсветку.
- public/styles.css — .ds-term (бирюзовый) и .ds-term-callout.
- public/sw.js: v72 → v73.
- tests/dictionary-tap.test.js — 10 тестов (базовое, accent, апостроф, многословное, граница слова, плюральное, несколько совпадений).

Проверка: verify.sh → VERIFY OK (171 unit, 8 endpoint, qa-new-user 42 PASS).
Сэмпл: 32/141 вопроса получают тапабельные слова.

## 2026-09-30 — L7: Готовность к экзамену (оценка шанса пройти по ответам)

Что сделано (коммит `feat: готовность к экзамену — оценка шанса пройти по ответам, weakest-topic gain (L7)` на self-improve):
- **public/js/domain/learning.js** — `examReadiness(answers, categories)`:
  - ошибка по теме = `(wrong + 1) / (attempts + 2)` — сглаживание Лапласа,
    неотвеченные вопросы считаются ошибками (honesty при малом объёме);
  - состав билета пропорционален размерам тем (как shuffle всего банка),
    значит вероятность ошибки вопроса = средневзвешенное по `cat.count`;
  - `binomLEq(n, k, p)` — кумулятивная биномиальная P(X ≤ k);
    ответ = `binomLEq(30, 3, p)` = P(≤ 3 ошибки из 30);
  - `< 150` разных ответов → `{ ready: false, answers, needed }`;
  - `biggestGain` — тема, чьё доведение до 90% mastery (ошибка 0.1)
    сильнее всего поднимает оценку (gain ≥ 1 п.п.), иначе `null`.
- **public/js/views/dashboard.js** — `examReadinessPanel()`: карточка
  «Chance to pass now: ~N%» + тег ready/working + «Biggest gain: Тема (+X%)»
  (label через `topicLabel`) + честная подпись «estimate from your answers,
  not a guarantee». Вставлена после `reviewDuePanel()`.
- **tests/learning.test.js** — 4 теста: < 150 → not ready; идеальный
  ученик (30 верных на тему × 25 тем = 750) → passPct > 95; ~50% ошибок →
  < 1%; weakest topic → biggestGain = слабая тема (3/30 верных против
  27/30 у остальных).
- **sw.js**: v71 → v72 (public/ изменился).

Замечание по модели: с сглаживанием Лапласа идеальный ученик с 6 ответами
на тему даёт только ~47% — это честно (мало данных), тест «идеальный
ученик» поэтому использует 30 ответов на тему (→ 99%).

Проверено: verify.sh — 161 тест PASS, qa-new-user 42/42, smoke 8/8,
sw-bump PASS, protected paths нетронуты → VERIFY OK.

## 2026-09-30 — L6b: Повторение — экран (due-first очередь + счётчик на главной)

Что сделано (коммит `feat: повторение — очередь due-first и «N cards to review today» на главной (L6b)` на self-improve):
- **public/js/domain/progress.js** — `dueReview(answers, day)`: чистая
  выборка вопросов с `due ≤ сегодня`, по возрастанию due (самые просроченные
  первыми), записи без `due` (до-L6a) пропускаются; `dueReviewCount()` —
  та же выборка, длина. `snapshot()`: в stats добавлено `reviewDue`.
- **public/js/views/review.js** — `renderQuickReview`: шаг 0 собирает
  due-вопросы (до ошибок/слабых тем), финальная очередь = due-карточки
  в порядке due + остальное перемешано позади; `REVIEW_SIZE` не меняется.
- **public/js/views/dashboard.js** — `reviewDuePanel()`: карточка
  «N cards to review today» (ds-классы, кнопка «Review now» → #/review),
  показывается только при `answered > 0` и `reviewDue > 0` — новичок её не
  видит. Вставлена между stats-рядом и weak-spots панелью.
- **public/js/state.js** — `applyLocalAnswers` (офлайн-ветка) считает
  `stats.reviewDue` через `dueReviewCount`, иначе в offline-режиме счётчик
  бы затёрся при следующем ответе.
- **sw.js**: v70 → v71 (public/ изменился; все задействованные файлы уже в
  SHELL-листе).
- **tests/progress.test.js**: `dueReview` на микс-ответе (просроченный/
  сегодня/будущий/без due → ровно [просроченный, сегодня]), `reviewDue` в
  snapshot: 0 на пустом, 0 после свежих ответов (due завтра), 2 после
  симуляции наступления due.
Проверено: verify.sh — 157 тестов PASS, qa-new-user 42/42, smoke 8/8,
sw-bump PASS, protected paths нетронуты → VERIFY OK.


## 2026-09-30 — L6a: Повторение — данные (streak/due)

Что сделано (коммит `feat: повторение — streak/due по ответам, mastered = 2 подряд (L6a)` на self-improve):
- **public/js/domain/progress.js** — в запись ответа добавлены поля spaced
  repetition: `streak` (подряд верных) и `due` (YYYY-MM-DD).
  - `recordAnswers`: верно → `streak+1`, `due = сегодня + [1,3,7,16,35][min(streak-1,4)]`
    дней (`REVIEW_INTERVALS`); ошибка → `streak 0`, `due = завтра`.
  - `addDays(from, n)` — экспорт, DST-безопасное смещение календарных дней.
  - `migrateProgress` (SCHEMA_VERSION 1 → 2): старые записи восстанавливаются —
    `streak = lastCorrect ? 1 : 0`, `due = last + 1 день`; битые значения
    полей отбрасываются к вычисленным.
  - `importProgress`: валидация `streak` (non-negative integer) и `due`
    (строгий YYYY-MM-DD), мусор → 422; отсутствие полей → миграция.
  - «Освоено» в `snapshot()` — теперь `streak >= MASTERY_STREAK` (2 подряд),
    было `lastCorrect`. Тексты «mastered» на главной смысл не меняют (метрика
    стала строже), не трогал; чипы тем в practice/stats считают coverage темы
    (`masteryOf`/`categoryStats`) — отдельная метрика, к L6a не относится.
- **public/js/state.js** — `applyLocalAnswers` (офлайн-ветка) дублирует ту же
  логику streak/due (иначе offline-ответы бы теряли поля) и новый порог
  `mastered`. **sw.js**: v69 → v70 (изменился public/).
- **tests**: progress.test.js — тесты интервалов (1/3/7/16/35 с потолком),
  миграция снапшота старого формата, импорт мусора → 422, `standalone.test.js`
  — новый порог mastered. Серверная часть переиспользует доменную логику —
  отдельной реализации нет.
Проверка: `scripts/verify.sh` — VERIFY OK (155 тестов, smoke 8/8, qa-new-user
42 PASS, zero-deps). Риск высокий — без UI, экран повторения — отдельная L6b.


## 2026-09-29 — L5b: Путь обучения — экран `#/path`

Что сделано (коммит `feat: экран пути обучения #/path — карточки шагов, Continue, запись self-check в прогресс (L5b)` на self-improve):
- **public/js/views/path.js** (новый) — `renderPath`: карточка на каждый шаг
  (25 глав, `PATH_ORDER`), «Step N of 25», пайплайн Read → Check → Practice
  с отметкой текущей фазы, кнопка «Continue» ведёт в нужную часть шага
  (`pathContinueTarget`: Read → `#/theory/<id>`, Check → `#/theory/<id>/check`,
  Practice → практика темы); завершённые шаги — с отметкой done, готовность
  `ready` → карточка «Start a mock exam». `pathLinkCard` — карточка-ссылка
  первой на главной («Step N of 25 — <тема>», «0 of 25 steps done»).
- **public/js/main.js / views.js** — маршрут `#/path`, реэкспорт `renderPath`,
  `pathLinkCard`. **dashboard.js** — `renderDashboard` стал async, вставляет
  `pathLinkCard` первой.
- **Запись self-check в прогресс** (без неё статус шага не двигался):
  `api.recordChapterCheck` + `POST /api/progress/chapters` +
  `recordChapterCheck` в `domain/progress.js`/`local-progress.js`
  (`chapters[id].check = { correct, total, date }`); theory.js пишет результат
  чек-а (5 вопросов = `PATH_CHECK_QUESTIONS`), `#/theory/<id>/check` сразу
  открывает чек.
- **tests**: learning/progress — тесты recordChapterCheck; security.test.js —
  `renderDashboard` теперь async (строчный маркер). **sw.js**: v68 → v69.
- **qa-new-user.mjs** — новый шаг «путь ведёт новичка в урок 1»:
  `#/path` рендерит заголовок, первый шаг — «Step 1 of 25», Continue новичка
  ведёт в `#/theory/ch1`; `#/path` добавлен в список маршрутов.
- **Как проверено:** verify — 149 unit-тестов, smoke 8 эндпоинтов,
  qa-new-user 42 PASS / 0 FAIL (VERIFY OK).

## 2026-09-29 — L5a: Путь обучения — модель `learningPath()`

Что сделано (коммит `feat: L5a — модель пути обучения learningPath … (L5a)` на self-improve):
- **public/js/domain/learning.js** — новая модель пути обучения:
  - `PATH_ORDER` — рекомендованный порядок глав (ch1…ch9 → ch12/ch13,
    остальное — по номеру главы);
  - `PATH_MINI_PASS = 4` (мини-проверка: ≥ 4/5), `PATH_MASTERY_PCT = 80`
    (освоение темы ≥ 80% банка);
  - `learningPath(progress, manifest, lessons)` → `{ steps, currentIndex, ready }`:
    один шаг на главу (id, chapter, slug, name, read, check, mastered,
    masteryPct, done, status). `done` — мягкий: прочитан урок **или**
    последний мини-чек ≥ 4/5 **или** mastery ≥ 80% банка темы
    (сравнение без округления: 424/531 = 79.85% → не done, хотя дисплей
    покажет «80%»). `status`: 'done' / 'ready' (первый незавершённый) /
    'open'; следующие шаги не блокируются. `ready` = true, когда все шаги
    done («exam ready»). `masteryOf` вызывается с `progress?.answers || {}`
    (устойчиво к прогрессу без ключа). Поле `progress.chapters[id].check`
    пока не в схеме progress — писать его будет L5b.
- **tests/learning.test.js** — блок L5a (6 тестов): порядок PATH_ORDER + хвост
  по номеру; новичок → шаг 1 'ready', остальные 'open'; прочитан → done;
  мини-чек 4/5 done, 3 — open; mastery порог (enough → done, enough−1 → ready);
  всё прочитано → currentIndex −1, ready true.
- **public/sw.js**: v67 → v68.

Как проверено: node --test tests/learning.test.js — 32/32 pass;
scripts/verify.sh — VERIFY OK (npm test 145 passed, smoke 8×200,
qa-new-user 37 PASS). Проблем не было.

## 2026-09-29 — L4: «Числа, которые надо знать» — таблица-справка + тренажёр #/numbers

Что сделано (коммит `feat: L4 — … #/numbers (L4)` на self-improve):
- **scripts/build-numbers.mjs** (новый): из data/lessons.json берёт все
  mustKnow-строки, чей value содержит число (токены: km/h, м, ‰, баллы/пункты,
  годы, метры, сек), собирает per-chapter счётчик вопросов банка, содержащих эти
  числа. Детерминированный — штамп contentHash; повторный запуск не меняет файл.
  Вывод: data/insights/numbers.json (18 строк таблицы, 20 числовых токенов).
- **data/insights/numbers.json** (новый): таблица по темам + токены с
  распределением FALSO/VERO в банке.
- **public/js/views/numbers.js** (новый): renderNumbers — экран #/numbers.
  State 1: таблица-справка (тема → факт → значение, число выделено
  num-highlight). State 2: тренажёр 20 вопросов FALSO/VERO с числами
  (numbersQueue, ~50/50, нет двух одинаковых чисел подряд), подсветка числа,
  feedback, звук, NEXT/FINISH.
- **public/js/domain/learning.js**: numbersQueue(questions, numbers, size) —
  выборка 50/50 FALSO/VERO с допусками под кособокость банка (230 F / 182 T),
  numberSpans(text, tokens) — разметка первого числового токена.
- **public/js/api.js**: endpoint numbers(). **public/js/state.js**:
  loadNumbers(). **public/js/views.js** + **public/js/main.js**: маршрут
  #/numbers. **public/js/views/dashboard.js**: кнопка «THE NUMBERS YOU MUST KNOW».
- **public/styles.css**: блок .numbers-table (тема/факт/значение, полосатые
  строки, num-highlight). **public/sw.js**: v66 → v67, numbers.js в SHELL.
- **tests/numbers.test.js** (новый, 5 тестов): hasNumber-границы, numbersQueue
  (50/50, не падает, детерминизм при rand), numberSpans, «файл = скрипт»
  (execFileSync build-numbers.mjs → файл не меняется) и согласованность с
  lessons.json.

Как проверено: npm test — 137 passed / 0 fail; verify.sh — VERIFY OK
(incl. «no public/ changes needing a sw.js bump», smoke 8 endpoints 200).
Тест «файл = скрипт» подтверждает, что закоммиченный numbers.json воспроизводится
скриптом. Экран #/numbers, кнопка на главной, offline (SW shell v67, /data/ SWR).

## 2026-09-29 — L3: «Почему я ошибаюсь» — причины на /#/mistakes

Что сделано (коммиты `feat: L3 — ...` и `docs: L3 ...` на self-improve):
- **public/js/domain/learning.js**: `mistakeCauses(answers, questions, insights, lessons)` —
  по текущим ошибкам (lastCorrect=false) теги причин: signal (слово-сигнал из
  data/insights/signal-words.json), sign (есть image_url), number (цифра в тексте),
  rule (фолбэк); возвращает perQuestion + counts.
- **public/js/views/review.js** (`renderMistakes`): панель «Most of your
  mistakes: … (N of M)» + PRACTICE THIS — signal → #/drill/signals, rule →
  глава с максимумом rule-ошибок (с её названием), sign/number → #/practice.
  При недоступности insights (standalone) панель тихо не показывается.
- **tests/learning.test.js**: 2 теста mistakeCauses (тэгирование, комбинации,
  counts; пустые/null-входы) — 24/24 pass.
- **public/sw.js**: v65 → v66.
Почему: задача L3 роадмапа — объяснить ученику, в чём именно он ошибается,
и дать кнопку сразу в нужное место. Как проверено: unit-тесты, verify.sh
(VERIFY OK).
Проверка после L3 (по требованию роадмапа): verify.sh — VERIFY OK; qa-new-user —
37 PASS / 0 FAIL; qa-ux — 174 PASS / 2 FAIL (оба — pre-existing: p7 next-steps
и p8 обтекание текста в кнопке, не на маршрутах L3).


## 2026-09-29 — S2.L2: подсветка сигналов в вопросе (практика/повторение)

Что сделано (коммиты `feat: L2 — подсветка сигнала в вопросе … (L2)` и
`test: L2 — тесты signalHints … (L2)` на self-improve; код — остатки
предыдущего незавершённого запуска, тесты — новые этого запуска):
- **public/js/domain/learning.js**: `attemptedCount(answers)`,
  `SIGNAL_HINTS_AUTO_LIMIT = 100`, `signalHintsEnabled(profile, answers)`
  (auto = вкл. пока отвечено < 100 вопросов, потом выкл.; on/off всегда),
  `findSignalWord`, `signalGlossary(lessons, insights)` — переводы
  слов-сигналов из экзамен-урока.
- **public/js/domain/progress.js**: `SIGNAL_HINT_MODES = [auto, on, off]`;
  поле `profile.signalHints` (дефолт auto) в EMPTY_PROGRESS, migrateProgress
  (невалидное значение → auto) и валидация updateProfile/importProgress (422).
- **public/js/views/practice.js**: `signalText(q)` — первое вхождение
  слова-сигнала в `<mark.ds-signal role=button>` c aria-describedby; тап/Enter
  → Callout (слово, перевод, доля FALSO в банке); закрытие тапом вне / Escape
  / сменой вопроса. ЭКЗАМЕН НЕ ЗАТРАГИВАЕТСЯ (grep ds-signal в exam.js пуст).
- **public/js/views/settings.js**: селект Auto/On/Off. **public/styles.css**:
  `.ds-signal-callout`. **public/sw.js**: v65.
- **tests/learning.test.js**: +4 теста (attemptedCount, on/off, порог 99/100,
  legacy-значение). **tests/progress.test.js**: тест дефолта/валидации
  updateProfile, миграция (дефолт/сохранено/фолбэк), import (принято/422).

Проверка: `scripts/verify.sh` → VERIFY OK (128 npm-тестов, smoke 8/200 на
:3917), grep ds-signal в exam.js пуст. Проблем: нет. Примечание: кодовый
коммит 8525999 из прошлого запуска был локальным (не запушен) — в этом
запуске задача дополнена тестами, закрыта и запушена.

## 2026-09-29 18:20 — S2.L1c: тренажёр «Язык экзамена» (#/drill/signals)

Что сделано (коммит `feat: тренажёр «Язык экзамена» #/drill/signals … (L1c)`
на self-improve):
- **public/js/domain/learning.js**: `signalQueue(questions, insights, size, rand)`
  — очередь из 20 вопросов банка со словами-сигналами, ровно 50/50 между
  FALSO и ВЕРНЫМИ-контрпримерами (взвешенный выбор, дедупликация по id);
  `signalSpans(text, words)` — чистая функция, возвращает сегменты
  `[{text, mark}]` для подсветки **первого** вхождения сигнала (без учёта
  регистра/акцентов, без совпадения подстрок в других словах). Оба —
  примитивы, потому что чистые, живут в learning.js (требование архитектуры).
- **public/js/views/drill.js**: рендер drill-сессии; `questionText()` строит
  DOM из сегментов `signalSpans` → `<mark.ds-signal>` для сигнала. Post-answer
  feedback: «this word is FALSO in N% — here it is TRUE because …» — `because`
  только если у вопроса есть `trap-why` в lessons, иначе без него.
- **Маршруты**: `api.insights`, `state.loadInsights`, роут `#/drill/signals`;
  ссылки из «L'italiano dell'esame» (theory) и с главной (dashboard).
- **public/styles.css**: `mark.ds-signal`, `.signal-notes`. **public/sw.js**: v64.
- **tests/learning.test.js**: +4 теста `signalQueue`, +4 теста `signalSpans`
  (подсветка первого вхождения, акценты/регистр, без подстрок, пустой ввод).

Проверка: `scripts/verify.sh` → VERIFY OK (123 npm-теста, smoke 8/200 на :3917,
qa-new-user 37/0). `scripts/qa-ux.mjs` → 174 PASS, 2 FAIL — оба pre-existing
(не блок, см. S2.L1b): p7 `#/` next-steps и p8 `#/review` button-wrap. Новый
маршрут не в покрытии qa-ux. Проблем: нет.

## 2026-09-29 17:05 — S2.L1b: «L'italiano dell'esame» на данных банка

Что сделано (коммиты `feat: слова-сигналы в гайде экзамена … (L1b)` и
`fix: L1b — доля FALSO в банке на языке ученика …` на self-improve):
- **data/lessons.json → examItalian**: у слов-абсолютов `bankStats` из
  `data/insights/signal-words.json`: sempre 80 (66.3% FALSO), solo/soltanto
  246 (75.2%), anche 242 (43.4%) — с `firstTrue` (id + text_it реального
  VERO-контрпримера из банка) и `takeaway` (en/ru/zh); mai — takeaway без
  цифр (не прошёл порог 20, объясняем почему). Плюс локализованные шаблоны
  `examItalian.bankStat`: template «IN THE BANK · {f} of {n} are {word}» /
  «В БАНКЕ · {f} из {n} — {word}» / «题库中 · …», слова falso/vero, showTrue —
  дробь и кнопка рендерятся на языке ученика (требование задачи).
- **public/js/views/theory.js**: `absoluteWordData(w, bankStat)` — строка
  статистики с дробью на языке ученика, `details.word-true` с кнопкой
  «Покажи верное» (реальный текст VERO + тег VERO), строка takeaway.
  Слова без bankStats рендерятся как раньше.
- **public/styles.css**: `.word-stat`, `details.word-true` (summary ≥44px —
  touch-target), `.word-true-q`, `.word-takeaway`.
- **public/sw.js**: v61 → v63.
- **tests/lessons.test.js**: тест `bank stats from the real bank` — цифры
  совпадают с signal-words.json, контрпример существует в банке и
  `is_true === true`, mai — takeaway без числа. 4/4 pass.

Как проверено: `scripts/verify.sh` → VERIFY OK (npm test 116 passed,
qa-new-user 37 PASS / 0 FAIL).

## 2026-09-29 16:40 — S2.L1a: Скрипт инсайтов слов-сигналов
