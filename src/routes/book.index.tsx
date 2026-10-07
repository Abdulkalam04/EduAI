import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { BookOpen, Check, FileText, Loader2, MoreVertical, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  GradientButton,
  PageHeader,
  SoftCard,
  rise,
  stagger,
} from "@/components/ui-custom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadDoc } from "@/lib/api";
import { useBookStore } from "@/store/useBookStore";

const TITLE = "Study From My Book — EduAI";
const DESC =
  "Upload a chapter from your textbook and chat, make notes, MCQs and flashcards from it.";

export const Route = createFileRoute("/book/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Library,
});

const STEPS = ["Extracting text", "Creating embeddings", "Ready"];

function Library() {
  const { docs, add, remove } = useBookStore();
  const [uploading, setUploading] = useState<{
    name: string;
    step: number;
    progress: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/pdf/i.test(f.type || f.name)) {
      toast.error("Please upload a PDF file.");
      return;
    }
    setUploading({ name: f.name, step: 0, progress: 0 });
    setUploadError("");
    try {
      const d = await uploadDoc(
        f,
        (step) => setUploading((current) => (current ? { ...current, step } : current)),
        (progress) => setUploading((current) => (current ? { ...current, progress } : current)),
      );
      add(d);
      toast.success(`${f.name} is ready to study`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed. Please try again.";
      setUploadError(message);
      toast.error(message);
    }
    setUploading(null);
  };

  const dropZone = (
    <button
      onClick={() => ref.current?.click()}
      disabled={!!uploading}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        drag ? "border-primary bg-muted" : "hover:bg-muted/60",
      )}
    >
      {uploading ? (
        <div className="w-full space-y-2 text-left">
          <p className="truncate text-sm font-medium">{uploading.name}</p>
          {STEPS.map((s, i) => (
            <p
              key={s}
              className={cn(
                "flex items-center gap-2 text-xs",
                i <= uploading.step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {i < uploading.step ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : i === uploading.step ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
              {s}
            </p>
          ))}
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-primary transition-all duration-300"
              style={{ width: `${uploading.progress || ((uploading.step + 1) / 3) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "var(--book-soft)", color: "var(--book)" }}
          >
            <Upload className="h-5 w-5" />
          </span>
          <span className="font-semibold">Upload PDF</span>
          <span className="text-xs text-muted-foreground">Drop a chapter or click to browse</span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Study From My Book"
        icon={BookOpen}
        accent="book"
        description="Upload a chapter from your textbook and learn from it with AI."
      />
      {uploadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="min-h-11 font-semibold underline"
          >
            Choose a PDF and retry
          </button>
        </div>
      )}
      {docs.length === 0 && !uploading ? (
        <div className="space-y-4">
          <EmptyState
            icon={BookOpen}
            accent="book"
            title="Your library is empty"
            description="Upload a PDF chapter to chat with it, make notes, quizzes and flashcards."
            action={
              <GradientButton onClick={() => ref.current?.click()}>
                <Upload className="h-4 w-4" />
                Upload PDF
              </GradientButton>
            }
          />
          <div className="hidden">{dropZone}</div>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {dropZone}
          {docs.map((d) => (
            <motion.div key={d.id} variants={rise}>
              <SoftCard interactive className="flex h-full min-h-48 flex-col p-5">
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: "var(--book-soft)", color: "var(--book)" }}
                  >
                    <FileText className="h-5 w-5" />
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Document options"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          remove(d.id);
                          toast("Document deleted");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="mt-3 truncate font-semibold">{d.title}</p>
                <p className="text-sm text-muted-foreground">
                  {d.pages} pages ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <Link to="/book/$id" params={{ id: d.id }} className="mt-auto pt-4">
                  <GradientButton variant="secondary" size="sm" className="w-full">
                    Open
                  </GradientButton>
                </Link>
              </SoftCard>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
