# Pixi → Skia → PDF

Тестовое задание на TypeScript: приложение собирает промежуточное
**Scene Tree** из `PIXI.Container` и скармливает его двум независимым
бэкендам:

1. **on-screen Skia (CanvasKit)** рендеру, и
2. **векторному PDF**-экспортёру, который пишет настоящие графические
   операторы PDF (`re`, `f`, `S`, `m`/`l`, cubic-bezier аппроксимация
   эллипса, `cm`-трансформы). **Никаких `toDataURL`, `html2canvas` или
   растрового снимка canvas.** PNG-спрайты вставляются как image
   XObject — это единственная допустимая растровая часть согласно ТЗ.

Оба канваса синхронизированы. Pointer-события работают на обоих —
в Pixi штатно, в Skia через свой hit-test, который диспатчит обратно
на оригинальный `PIXI.DisplayObject`.

- Репозиторий: <https://github.com/artemka-permyak/sboard-test-task>
- Демо: <https://artemka-permyak.github.io/sboard-test-task/> (после первого
  деплоя через GitHub Pages — см. ниже)

## Быстрый старт

```bash
npm install
npm run dev
# открыть http://localhost:5173
```

В статус-баре видно активный PDF-бэкенд:

> Ready · N display objects · PDF: pdf-lib (fallback)

Слово «fallback» отражает архитектуру (см. ниже) — скачанный PDF в любом
случае векторный. Образец лежит в репо:

```bash
node scripts/generate-sample-pdf.mjs   # переписывает samples/sample.pdf
open samples/sample.pdf                # либо открыть любым PDF-вьюером
```

## Два PDF-бэкенда

Диспатчер `src/pdf/exportToPdf.ts` смотрит в рантайме, есть ли у
загруженного CanvasKit метод `MakePDFDocument()`:

| Бэкенд | Когда активен | Что пишет |
| --- | --- | --- |
| **SkPDF** через кастомный CanvasKit | существует `public/canvaskit/canvaskit.{js,wasm}` | Настоящий Skia PDF |
| **pdf-lib** (по умолчанию) | иначе | Векторный PDF из той же scene tree |

Оба бэкенда читают **одно и то же промежуточное Scene Tree**
(`src/scene/sceneTree.ts`). Маппинг scene-tree → примитивы (rect,
ellipse, line, polygon path, sprite, group с transform) одинаков —
визуально результат идентичен, отличается только энкодер. Подмена
pdf-lib на настоящий SkPDF — это замена ровно одного файла.

### Как получить настоящий SkPDF

Стоковый `canvaskit-wasm` собран без `SkPDF`. Чтобы получить настоящий
Skia PDF, нужна кастомная сборка CanvasKit с флагом `skia_use_pdf=true`
и Embind-биндингами `MakePDFDocument` — вся инфраструктура лежит в
[`build-canvaskit-pdf/`](build-canvaskit-pdf/README.md) (Dockerfile,
C++ биндинги, GN args, build-скрипт).

Локальная Docker-сборка требует стабильной сети до `googlesource.com`
для клонирования ~50 third-party deps Skia. На macOS под vpnkit это
часто не получается. Для таких случаев есть GitHub Actions:

[**.github/workflows/build-canvaskit.yml**](.github/workflows/build-canvaskit.yml)

1. Открыть **Actions → Build CanvasKit with SkPDF → Run workflow**.
2. Подождать ~30-50 минут (большая часть — компиляция Skia).
3. Скачать артефакт `canvaskit-pdf` (zip ~3-7 MB).
4. Распаковать `canvaskit.{js,wasm}` в `public/canvaskit/`, закоммитить,
   запушить.
5. Статус-бар покажет **`PDF: SkPDF`** — экспорт пойдёт через настоящий
   Skia.

## Production build

```bash
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # отдать dist/ локально
```

Если на момент сборки в `public/canvaskit/` лежат `canvaskit.{js,wasm}`,
Vite скопирует их в `dist/canvaskit/`, и задеплоенное приложение
поедет на SkPDF. Иначе пойдёт с pdf-lib — для демо-деплоя нормально.

## Архитектура

```
PIXI.Container
   │
   ▼  pixi/pixiToSceneTree.ts   (читает geometry.graphicsData, localTransform)
Intermediate Scene Tree  (scene/sceneTree.ts)
   │
   ├──▶ skia/skiaRenderer.ts            SkiaSurfaceRenderer → on-screen canvas
   │
   ├──▶ pdf/exportToPdfSkia.ts          SkPDF document   ┐
   │                                                     │  pdf/exportToPdf.ts
   └──▶ pdf/exportToPdfLib.ts           pdf-lib writer   ┘  выбирает бэкенд
   │
   └──▶ events/hitTest.ts + skiaPointerEvents.ts → dispatch на оригинальный DisplayObject
```

```
src/
  scene/sceneTree.ts          Единый source of truth для нод + матриц
  pixi/                       Pixi setup + Scene Tree конвертер
  skia/
    initSkia.ts               Two-tier loader: кастомная сборка → npm fallback
    skiaRenderer.ts           SceneRenderer (общий для on-screen И PDF) + SkiaSurfaceRenderer
    canvaskitPdf.ts           Структурное расширение типов + hasPDFBackend() guard
  pdf/
    exportToPdf.ts            Диспатчер (Skia first, pdf-lib fallback)
    exportToPdfSkia.ts        SkPDF document → vector PDF bytes
    exportToPdfLib.ts         pdf-lib vector writer (та же scene tree)
  events/                     Skia hit-test + dispatch на Pixi-листенеры
  ui/                         DOM-биндинги + лог
  app/createApp.ts            Связывает всё вместе
  main.ts                     Entry point
build-canvaskit-pdf/          Docker + биндинги для сборки CanvasKit с SkPDF
.github/workflows/            GH Actions: сборка CanvasKit на Ubuntu-раннере
```

## Стек

- TypeScript 6 (strict, `noUnusedLocals`, `noUnusedParameters`)
- Vite 8
- `pixi.js-legacy` 7.2.4 (Canvas2D, `forceCanvas: true`)
- `canvaskit-wasm` 0.41.1 (или наша кастомная сборка с SkPDF)
- `pdf-lib` 1.17.1 (fallback vector PDF writer)
- Docker (опционально, только для `npm run build:canvaskit`)

## Проверка PDF на векторность

После `Export PDF`:

```bash
# 1. Зум до 1600 % в любом PDF-вьюере — фигуры остаются ровные.

# 2. Изображений в страничном content stream должно быть 0
#    (или только спрайт, если он в сцене):
pdfimages -list pixi-skia-export.pdf

# 3. Конвертация в SVG — должны увидеть <path>/<rect>/<ellipse>,
#    а НЕ один большой <image>:
mutool draw -F svg -o page.svg pixi-skia-export.pdf

# 4. Грепнуть сырые PDF-операторы
#    (re=прямоугольник, f=fill, S=stroke, m/l/c=path, cm=transform):
qpdf --qdf --object-streams=disable pixi-skia-export.pdf out.pdf
grep -E '\b(re|f|S|m|l|cm)\b' out.pdf | head
```

У PDF из SkPDF в метаданных будет `/Producer (Skia/PDF …)`, у
pdf-lib — `/Producer (pdf-lib …)`.

В репо коммитнут `samples/sample.pdf` (1 КБ, генерируется Node-скриптом
`scripts/generate-sample-pdf.mjs` через pdf-lib из аналогичной сцены)
для быстрой проверки векторности без запуска dev-сервера.

## Деплой

### GitHub Pages (используется)

Уже настроен через GH Actions: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

Включение в первый раз:

1. Repo → **Settings → Pages → Build and deployment → Source = GitHub Actions**.
2. Push в `main` (или Actions → Deploy to GitHub Pages → Run workflow).
3. Через ~2 минуты доступно на <https://artemka-permyak.github.io/sboard-test-task/>.

Каждый последующий push в `main` автоматически обновляет деплой.

В `vite.config.ts` стоит `base: './'`, а в `src/skia/initSkia.ts`
пути к кастомному CanvasKit строятся через `import.meta.env.BASE_URL`,
поэтому деплой под `/<repo-name>/` поддоменом работает без правок.

### Альтернативы

**Vercel** — import репо на <https://vercel.com/new>, preset Vite,
build `npm run build`, output `dist`. Деплой за минуту.

**Netlify** — New site → connect repo. Build `npm run build`, publish `dist`.

Кастомный бандл CanvasKit (~3-7 MB) попадает в дист из
`public/canvaskit/`, если он там лежит. Чтобы задеплоить *без* него
(меньше бандл, только pdf-lib) — просто не клади файлы в
`public/canvaskit/` перед сборкой.

## Соответствие ТЗ

| Пункт | Статус |
|---|---|
| TypeScript, модульная архитектура, комментарии | ✅ |
| `pixi.js-legacy@7.2.4`, `forceCanvas: true` | ✅ |
| Обёртка для Skia, принимающая `PIXI.Container` | ✅ `src/pixi/pixiToSceneTree.ts` + `src/skia/skiaRenderer.ts` |
| translate / rotate / scale (+ pivot/skew/alpha бонусом) | ✅ через `transform.localTransform` |
| `PIXI.Graphics`: `drawShape` / `drawRect` / `moveTo` / `lineTo` | ✅ плюс `drawEllipse`/`drawCircle`/`lineStyle`/`begin/endFill` |
| `PIXI.Sprite` PNG | ✅ |
| Вложенные контейнеры, рекурсивный обход с матрицами | ✅ |
| `pointerdown` / `pointerup` на Pixi canvas | ✅ нативно |
| `pointerdown` / `pointerup` на Skia canvas | ✅ свой hit-test + dispatch на оригинальный DisplayObject |
| Кнопка «случайная фигура» (один из двух вариантов интерактивности) | ✅ |
| PDF — векторный, не скриншот canvas | ✅ настоящие операторы PDF, без `toDataURL` |
| PDF через **Skia PDF backend** (кастомная wasm) | ⚠️ инфраструктура готова (`build-canvaskit-pdf/` + GH Actions); pdf-lib как fallback на той же scene tree |
| UI с кнопками, просмотром сцены, экспортом PDF | ✅ |
| `npm run dev/build/preview` | ✅ |
| Загружено на GitHub | ✅ |
| Задеплоено на бесплатный хостинг | ✅ GitHub Pages, авто-деплой при push в main |

## Ограничения

- Поддерживаемые `PIXI.Graphics`: `drawRect`, `drawEllipse`,
  `drawCircle`, линии через `moveTo`/`lineTo`, полигоны через
  `drawPolygon`, `beginFill`/`endFill`, `lineStyle`. Маски, фильтры,
  blend modes, градиенты и текст не поддержаны.
- PNG-спрайт вставляется в PDF как image XObject (по ТЗ разрешено —
  источник растровый).
- Hit-test реализован для rect / ellipse / line (с учётом lineWidth) /
  polygon / sprite bounds.
- Vite-dev по умолчанию слушает порт `5173`; CanvasKit грузится по
  абсолютным `/canvaskit/...` путям, поэтому при деплое под
  подпапкой нужно подкрутить `base` в `vite.config.ts`.
