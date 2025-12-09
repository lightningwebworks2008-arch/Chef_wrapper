import { useState, useEffect } from 'react';
import { ToastContainer, cssTransition } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const toastAnimation = cssTransition({
  enter: 'animate-fade-in',
  exit: 'animate-fade-out',
});

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [chatStarted, setChatStarted] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('bolt_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bolt_theme', theme);
  }, [theme]);

  const handleSendMessage = () => {
    if (!input.trim()) return;
    
    const newMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setChatStarted(true);
    
    // Mock assistant response - will be replaced with Supabase edge function
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'This is a placeholder response. Connect to Supabase to enable AI functionality.' 
      }]);
    }, 500);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">BC</span>
          </div>
          <span className="font-semibold text-lg">Bolt-Chef</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14 h-screen flex">
        {/* Sidebar placeholder */}
        <aside className="w-64 border-r border-border bg-card hidden lg:block">
          <div className="p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-4">Chat History</h2>
            <p className="text-sm text-muted-foreground">No previous chats</p>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {!chatStarted ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <h1 className="text-4xl lg:text-6xl font-bold text-center mb-4 animate-fade-in">
                Where ideas begin
              </h1>
              <p className="text-lg lg:text-xl text-muted-foreground text-center mb-8 animate-fade-in">
                Bring ideas to life in seconds or get help on existing projects.
              </p>
              
              {/* Example prompts */}
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mb-8">
                {['Build a todo app', 'Create a landing page', 'Design a dashboard'].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="px-4 py-2 rounded-full border border-border hover:bg-accent transition-colors text-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]' 
                        : 'bg-card border border-border max-w-[80%]'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-border p-4">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="How can Bolt help you today?"
                  className="w-full min-h-[60px] max-h-[200px] p-4 pr-12 rounded-xl border border-border bg-card resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={1}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim()}
                  className="absolute right-3 bottom-3 p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Workbench placeholder */}
        <aside className="w-1/2 border-l border-border bg-card hidden xl:block">
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-4xl mb-4">🛠️</div>
              <p className="text-lg font-medium">Workbench</p>
              <p className="text-sm">Code preview will appear here</p>
            </div>
          </div>
        </aside>
      </main>

      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar
        transition={toastAnimation}
        theme={theme}
      />
    </div>
  );
}

export default App;
