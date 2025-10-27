import { useToast } from "@/components/ui/use-toast";

export function useShare() {
  const { toast } = useToast();

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
        toast({ description: 'Link copied to clipboard!' });
      } catch (error) {
        console.error('Clipboard write failed:', error);
        toast({ description: 'Failed to copy link.', variant: 'destructive' });
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

        toast({
          description: successful
            ? "Link copied to clipboard!"
            : "Failed to copy link.",
          variant: successful ? "default" : "destructive"
        });
      } catch (error) {
        console.error("Fallback copy failed:", error);
        toast({ description: "Failed to copy link.", variant: "destructive" });
      }
    }
  };

  return { shareUrl };
}
