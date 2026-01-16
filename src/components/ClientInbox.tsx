'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Client, EmailMessage, EmailThreadSummary } from '@/types';
import { X, RefreshCcw, Send, Loader2, MailPlus } from 'lucide-react';

interface ClientInboxProps {
  client: Client;
  onClose: (refresh?: boolean) => void;
  onThreadsSeen: (clientId: string) => void;
}

const formatDate = (timestamp?: string) => {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp));
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const sanitizeHtml = (html?: string) => {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const uniqueEmails = (values: (string | undefined | null)[]) => {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(value => value.trim().toLowerCase())
    )
  );
};

export default function ClientInbox({ client, onClose, onThreadsSeen }: ClientInboxProps) {
  const [threads, setThreads] = useState<EmailThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerTo, setComposerTo] = useState('');
  const [composerSubject, setComposerSubject] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const defaultRecipients = useMemo(() => {
    return uniqueEmails([
      client.primaryEmail,
      client.email,
      ...(client.altEmails || []),
    ]);
  }, [client]);

  useEffect(() => {
    setComposerTo(defaultRecipients.join(', '));
    setComposerSubject('');
    setComposerBody('');
    setSelectedThreadId(null);
    setMessages([]);
    setSuccessMessage('');
    void loadThreads(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const loadThreads = async (reset = false, pageToken?: string) => {
    try {
      if (reset) {
        setThreadsLoading(true);
        setThreads([]);
        setNextPageToken(undefined);
      }
      setThreadsError(null);
      const url = new URL(`/api/gmail/searchThreads`, window.location.origin);
      url.searchParams.set('clientId', client.id);
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Impossible de récupérer les conversations');
      }
      const data = await response.json();
      setThreads(prev => (reset ? data.threads : [...prev, ...data.threads]));
      setNextPageToken(data.nextPageToken);
      if (reset) {
        onThreadsSeen(client.id);
      }
    } catch (error) {
      setThreadsError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      if (reset) {
        setThreadsLoading(false);
      }
      if (!reset) {
        setLoadingMore(false);
      }
    }
  };

  const loadMoreThreads = () => {
    if (!nextPageToken) return;
    setLoadingMore(true);
    void loadThreads(false, nextPageToken);
  };

  const handleSelectThread = async (thread: EmailThreadSummary) => {
    setSelectedThreadId(thread.id);
    setMessagesLoading(true);
    setSuccessMessage('');
    try {
      const url = new URL('/api/gmail/thread', window.location.origin);
      url.searchParams.set('threadId', thread.id);
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Impossible de charger ce thread');
      }
      const data = await response.json();
      setMessages(data.messages);
      const nextSubject = thread.subject || '';
      const subjectHasRe = nextSubject.toLowerCase().startsWith('re:');
      setComposerSubject(subjectHasRe ? nextSubject : nextSubject ? `Re: ${nextSubject}` : 'Re:');
      const replyToEmails = extractReplyTo(data.messages);
      if (replyToEmails.length) {
        setComposerTo(replyToEmails.join(', '));
      }
    } catch (error) {
      setThreadsError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setMessagesLoading(false);
    }
  };

  const extractReplyTo = (msgs: EmailMessage[]) => {
    if (!msgs.length) return defaultRecipients;
    const lastMessage = msgs[msgs.length - 1];
    const addresses = uniqueEmails([
      ...(lastMessage.replyTo || []).map(address => address.address),
      ...(lastMessage.from ? [lastMessage.from.address] : []),
    ]);
    return addresses.length ? addresses : defaultRecipients;
  };

  const resetComposer = () => {
    setSelectedThreadId(null);
    setMessages([]);
    setComposerTo(defaultRecipients.join(', '));
    setComposerSubject('');
    setComposerBody('');
    setSuccessMessage('');
    setThreadsError(null);
  };

  const handleSend = async () => {
    if (!composerTo.trim()) {
      setThreadsError('Ajoute au moins un destinataire');
      return;
    }
    setSending(true);
    setThreadsError(null);
    setSuccessMessage('');
    try {
      const to = composerTo.split(/[,\n;]/).map(item => item.trim()).filter(Boolean);
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: composerSubject || 'Sans sujet',
          bodyHtml: composerBody,
          bodyText: composerBody,
          threadId: selectedThreadId || undefined,
          clientId: client.id,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de l\'envoi');
      }
      setSuccessMessage('Email envoyé ✅');
      setComposerBody('');
      await loadThreads(true);
      if (selectedThreadId) {
        setSelectedThreadId(null);
        setMessages([]);
      }
    } catch (error) {
      setThreadsError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find(thread => thread.id === selectedThreadId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <MailPlus className="w-5 h-5 text-blue-600" />
              Inbox client — {client.name}
            </h2>
            {defaultRecipients.length > 0 && (
              <p className="text-sm text-gray-500">Destinataires: {defaultRecipients.join(', ')}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadThreads(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              disabled={threadsLoading}
            >
              {threadsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Rafraîchir
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                resetComposer();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
            >
              <MailPlus className="w-4 h-4" />
              Nouveau mail
            </button>
            <button
              onClick={() => onClose(false)}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {threadsError && (
          <div className="bg-red-50 px-6 py-3 text-sm text-red-700">{threadsError}</div>
        )}
        {successMessage && (
          <div className="bg-green-50 px-6 py-3 text-sm text-green-700">{successMessage}</div>
        )}

        <div className="grid grid-cols-1 gap-0 md:grid-cols-3 flex-1 overflow-hidden">
          <div className="border-r md:col-span-1 h-full overflow-y-auto">
            {threadsLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : threads.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-500">
                Aucun email pour ce client pour le moment.
              </div>
            ) : (
              <ul className="divide-y">
                {threads.map(thread => (
                  <li key={thread.id}>
                    <button
                      onClick={() => handleSelectThread(thread)}
                      className={`w-full text-left px-4 py-3 transition ${
                        thread.id === selectedThreadId ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium text-gray-900 line-clamp-1">{thread.subject || '(Sans sujet)'}</h3>
                        {thread.unread && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">{thread.snippet}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatDate(thread.lastUpdated)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nextPageToken && (
              <div className="px-4 py-3 border-t">
                <button
                  onClick={loadMoreThreads}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
              </div>
            )}
          </div>

          <div className="md:col-span-2 h-full overflow-y-auto">
            {selectedThreadId ? (
              <div className="p-6 space-y-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map(message => (
                      <div key={message.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex justify-between text-sm text-gray-600">
                          <div>
                            <p className="font-semibold text-gray-800">{message.from?.address}</p>
                            <p className="text-xs text-gray-500">À: {message.to.map(addr => addr.address).join(', ') || '—'}</p>
                          </div>
                          <span>{formatDate(message.internalDate)}</span>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800">
                          {message.textBody || sanitizeHtml(message.htmlBody)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-sm text-gray-500">
                Sélectionne une conversation à gauche ou compose un nouvel email ci-dessous.
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Composer un message</h3>
            {activeThread && (
              <span className="text-xs text-gray-500">Tu réponds au thread « {activeThread.subject || 'Sans sujet'} »</span>
            )}
          </div>
          <div className="grid gap-3">
            <div>
              <label className="text-xs uppercase text-gray-500">Destinataires</label>
              <input
                type="text"
                value={composerTo}
                onChange={(e) => setComposerTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="ex: client@example.com, second@example.com"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-500">Sujet</label>
              <input
                type="text"
                value={composerSubject}
                onChange={(e) => setComposerSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Sujet de l'email"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-500">Message</label>
              <textarea
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={5}
                placeholder="Ton message..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onClose(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-white"
              >
                Fermer
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
