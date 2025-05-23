import { useState } from 'react';
import Modal from '@/components/modal';
import { Textarea } from '@/components/ui/textarea';

interface AdminPublishNotificationModalProps {
  onClose: () => void;
  onSubmit?: () => void;
}

export function AdminPublishNotificationModal({ onClose, onSubmit }: AdminPublishNotificationModalProps) {
  const [notificationType, setNotificationType] = useState('notify_all');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePublish = async () => {
    // No backend logic yet
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      if (onSubmit) onSubmit();
      onClose();
    }, 500);
    return true;
  };

  return (
    <Modal
      title="Publish Notification"
      onClose={onClose}
      onConfirm={handlePublish}
      confirmText={isSubmitting ? 'Publishing...' : 'Publish'}
      confirmDisabled={isSubmitting || !message.trim()}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notification Type
          </label>
          <select
            value={notificationType}
            onChange={e => setNotificationType(e.target.value)}
            className="w-full p-2 border rounded-md bg-white"
            disabled
          >
            <option value="notify_all">Notify all users</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Enter your notification message..."
            rows={6}
            className="bg-white"
          />
        </div>
      </div>
    </Modal>
  );
} 