import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ImageIcon, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import Image from "next/image";

type InspirationProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Props = {
  id: string;
  file?: File;
  url?: string;
  storageId?: string;
  uploaded: boolean;
  uploading: boolean;
  error?: string;
  isFromServer?: boolean;
};

const InspirationSidebar = ({ isOpen, onClose }: InspirationProps) => {
  const [images, setImages] = useState<Props[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const generateUploadUrl = useMutation(api.inspiration.generateUploadUrl);
  const addInspirationImageMutation = useMutation(
    api.inspiration.addInspirationImage
  );
  const removeInspirationImage = useMutation(
    api.inspiration.removeInspirationImage
  );

  const existingImages = useQuery(
    api.inspiration.getInspirationImages,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const uploadImage = useCallback(
    async (file: File): Promise<{ storageId: string }> => {
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) {
          throw new Error("Failed to upload image");
        }
        const { storageId } = await result.json();

        if (projectId) {
          await addInspirationImageMutation({
            projectId: projectId as Id<"projects">,
            storageId: storageId as Id<"_storage">,
          });
        }
        return { storageId };
      } catch (error) {
        console.error(error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Failed to upload image");
      }
    },
    [projectId, generateUploadUrl, addInspirationImageMutation]
  );

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const newImages: Props[] = Array.from(files)
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, 6 - images.length) // Limit to 6 total images
        .map((file) => ({
          id: `temp-${Date.now()}-${Math.random()}`,
          file,
          url: URL.createObjectURL(file),
          uploaded: false,
          uploading: false,
        }));
      if (newImages.length > 0) {
        setImages((prev) => [...prev, ...newImages]);
        newImages.forEach(async (image) => {
          setImages((prev) =>
            prev.map((img) =>
              img.id === image.id ? { ...img, uploading: true } : img
            )
          );
          try {
            const { storageId } = await uploadImage(image.file!);
            setImages((prev) =>
              prev.map((img) =>
                img.id === image.id
                  ? {
                      ...img,
                      uploaded: true,
                      uploading: false,
                      storageId,
                      isFromServer: true,
                    }
                  : img
              )
            );
          } catch (error) {
            console.error("Upload failed:", error);
            setImages((prev) =>
              prev.map((img) =>
                img.id === image.id
                  ? { ...img, uploading: false, error: "Upload failed" }
                  : img
              )
            );
          }
        });
      }
    },
    [images.length, uploadImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [handleFileSelect]
  );

  useEffect(() => {
    if (existingImages && existingImages.length > 0) {
      const serverImages: Props[] = existingImages.map((img) => ({
        id: img.id,
        url: img.url || undefined,
        storageId: img.storageId,
        uploaded: true,
        uploading: false,
        isFromServer: true,
      }));

      setImages((prev) => {
        const localImages = prev.filter((img) => !img.isFromServer);
        return [...localImages, ...serverImages];
      });
    } else if (existingImages && existingImages.length === 0) {
      setImages((prev) => prev.filter((img) => !img.isFromServer));
    }
  }, [existingImages]);

  const clearAllImages = async () => {
    const imagesToRemove = images.filter(
      (img) => img.storageId && img.isFromServer
    );

    for (const image of imagesToRemove) {
      if (projectId && image.storageId) {
        try {
          await removeInspirationImage({
            projectId: projectId as Id<"projects">,
            storageId: image.storageId as Id<"_storage">,
          });
        } catch (error) {}
      }
    }
    setImages([]);
  };

  const removeImage = async (imageId: string) => {
    const imageToRemove = images.find((img) => img.id === imageId);
    if (!imageToRemove) return;
    if (imageToRemove.storageId && imageToRemove.isFromServer && projectId) {
      try {
        await removeInspirationImage({
          projectId: projectId as Id<"projects">,
          storageId: imageToRemove.storageId as Id<"_storage">,
        });
      } catch (error) {
        toast.error("Failed to remove image from server");
        console.error("Error removing image from server:", error);
      }
    }

    setImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  return (
    <div
      className={cn(
        "fixed left-5 top-1/2 transform -translate-y-1/2 w-80 backdrop-blur-xl bg-white/[0.08] border-white/[0.12] gap-2 p-3 saturate-150 border rounded-lg z-50 transition-transformduration-300",
        isOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
      )}
    >
      <div
        className="p-4 flex flex-col gap-4
     overflow-y-auto max-h-[calc(100ch-8-rem)]"
      >
        <div className="flex items-center justify-between">
          <ImageIcon className="w-5 h-5 text-white/80" />
          <Label className="text-white/80 font-medium">Inspiration Board</Label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5 text-white/80" />
        </Button>
      </div>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer",
          dragActive
            ? "border-blue-400 bg-blue-500/10"
            : images.length < 6
            ? "border-white/20  hover:border-white/40 hover:bg-white/5"
            : "border-white/10 bg-white/5 cursor-not-allowed opacity-50"
        )}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => images.length < 6 && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-5 h-5 text-white/80" />
          <p className="text-sm text-white/60">
            {images.length < 6 ? (
              <>
                Drop images here or{" "}
                <span className="[text-blue-400">browse</span>
                <br />
                <span className="text-xs [text-white/40">
                  {/* {images.length}/6 images uploaded */}
                </span>
              </>
            ) : (
              "Maximum 6 images reached"
            )}
          </p>
        </div>
      </div>

      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-white/80 text-sm">
              Uploaded Images ({images.length})
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllImages}
              className="h-7 px-2 text-xs text-white/60 hover:text-white hover:bg-white/10"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear All
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="relative group aspect-square rounded-lg overflow-hidden
                         border border-white/10 bg-white/5"
              >
                <Image
                  src={img.url || ""}
                  alt="Inspiration"
                  className="w-full h-full object-cover"
                  width={100}
                  height={100}
                />
                {img.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}

                {img.error && (
                  <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                    <p className="text-xs [text-red-300 text-center px-2">
                      {img.error}
                    </p>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70 opacity-0
group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </Button>

                {img.uploaded && !img.uploading && (
                  <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border border-white/20"></div>
                )}
              </div>
            ))}

            {images.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-white/20 bg-white/5
hover:border-white/40 hover:bg-white/10 transition-all duration-200 flex items-center
justify-center group"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InspirationSidebar;
