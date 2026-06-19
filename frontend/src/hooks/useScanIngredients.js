import { useCallback, useState } from "react";
import { toast } from "sonner";
import { scanFridge } from "../lib/api";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(",");
      resolve({ base64: result.slice(comma + 1), mime: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Custom hook: encapsulates camera/file selection, file validation, base64
 * encoding, scan API call, and resulting toast notifications. Returns the
 * UI state plus a single `processFile(file)` handler.
 */
export function useScanIngredients({ existing, onIngredients }) {
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);

  const processFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!/image\/(jpeg|jpg|png|webp)/i.test(file.type)) {
        toast.error("Please use a JPG, PNG, or WEBP image.");
        return;
      }
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setScanning(true);
      try {
        const { base64, mime } = await readFileAsBase64(file);
        const data = await scanFridge(base64, mime);
        const found = Array.isArray(data.ingredients) ? data.ingredients : [];
        if (found.length === 0) {
          toast.warning("Couldn't spot ingredients. Try a clearer photo or add manually.");
        } else {
          toast.success(`Found ${found.length} ingredient${found.length === 1 ? "" : "s"}.`);
        }
        const merged = Array.from(new Set([...(existing || []), ...found]));
        onIngredients(merged);
      } catch (e) {
        const msg = e?.response?.data?.detail || e?.message || "Scan failed";
        toast.error(msg);
      } finally {
        setScanning(false);
      }
    },
    [existing, onIngredients]
  );

  return { preview, scanning, processFile };
}
