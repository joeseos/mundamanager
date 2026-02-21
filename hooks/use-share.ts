import { toast } from 'sonner';

export function useShare() {
  

  const shareUrl = async (title: string, url: string = window.location.href) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        // Ignore AbortError - user simply canceled the share dialog
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error("Sharing failed:", error);
      }
    } else if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard!');
      } catch (error) {
        console.error('Clipboard write failed:', error);
        toast.error('Failed to copy link.');
      }
    } else {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        document.body.appendChild(textArea);
        textArea.select();

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        successful ? toast.success("Link copied to clipboard!") : toast.error("Failed to copy link.");
      } catch (error) {
        console.error("Fallback copy failed:", error);
        toast.error("Failed to copy link.");
      }
    }
  };

  return { shareUrl };
}
