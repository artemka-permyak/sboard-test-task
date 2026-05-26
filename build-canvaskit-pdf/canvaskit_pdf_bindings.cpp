// Embind bindings that expose Skia's PDF backend to JavaScript.
//
// CanvasKit's default `canvaskit_bindings.cpp` does not expose SkPDF. This
// file is dropped into modules/canvaskit/ alongside the stock bindings and
// added to the canvaskit build target by build.sh.
//
// Exposes:
//   PDFDocument          — opaque wrapper around SkDocument
//     .beginPage(w, h)   -> Canvas (raw SkCanvas*, owned by the document)
//     .endPage()
//     .close()           -> Uint8Array of encoded PDF bytes
//     .delete()          — release if close() was not called
//   MakePDFDocument()    -> PDFDocument

#include <emscripten.h>
#include <emscripten/bind.h>

#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkRefCnt.h"
#include "include/core/SkStream.h"
#include "include/core/SkDocument.h"
#include "include/docs/SkPDFDocument.h"

using namespace emscripten;

namespace {

class PDFDocumentJS : public SkRefCnt {
public:
    PDFDocumentJS()
        : fStream(), fDoc(SkPDF::MakeDocument(&fStream)), fClosed(false) {}

    ~PDFDocumentJS() override {
        if (!fClosed && fDoc) {
            fDoc->close();
        }
    }

    SkCanvas* beginPage(SkScalar width, SkScalar height) {
        if (!fDoc || fClosed) return nullptr;
        return fDoc->beginPage(width, height);
    }

    void endPage() {
        if (fDoc && !fClosed) fDoc->endPage();
    }

    // Finalizes the PDF and returns a JS Uint8Array containing the bytes.
    // After this call no further operations are valid.
    val close() {
        if (fClosed || !fDoc) return val::null();
        fDoc->close();
        fClosed = true;
        fDoc.reset();
        sk_sp<SkData> data = fStream.detachAsData();
        const size_t sz = data->size();
        // Allocate a JS-owned Uint8Array and copy the WASM-heap bytes into it
        // so the JS side owns the lifetime.
        val u8 = val::global("Uint8Array").new_(sz);
        val view = val(typed_memory_view(sz, data->bytes()));
        u8.call<void>("set", view);
        return u8;
    }

private:
    SkDynamicMemoryWStream fStream;
    sk_sp<SkDocument> fDoc;
    bool fClosed;
};

sk_sp<PDFDocumentJS> MakePDFDocument() {
    return sk_make_sp<PDFDocumentJS>();
}

}  // namespace

EMSCRIPTEN_BINDINGS(CanvasKit_PDF) {
    class_<PDFDocumentJS>("PDFDocument")
        .smart_ptr<sk_sp<PDFDocumentJS>>("sk_sp<PDFDocument>")
        .function("beginPage", &PDFDocumentJS::beginPage, allow_raw_pointers())
        .function("endPage", &PDFDocumentJS::endPage)
        .function("close", &PDFDocumentJS::close);

    function("MakePDFDocument", &MakePDFDocument);
}
