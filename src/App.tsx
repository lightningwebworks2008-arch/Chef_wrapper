import { useState, useEffect } from 'react';
import { ToastContainer, cssTransition } from 'react-toastify';
import { Send, Sparkles, Code, Layout, Zap } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';

const toastAnimation = cssTransition({
  enter: 'animate-fade-in',
  exit: 'animate-fade-out',
});

const suggestionPrompts = [
  { icon: Code, text: 'Build a todo app with local storage' },
  { icon: Layout, text: 'Create a modern landing page' },
  { icon: Zap, text: 'Design an interactive dashboard' },
];

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
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-xl tracking-tight">Bolt-Chef</span>
        </div>
        
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl hover:bg-accent transition-all duration-200 hover:scale-105"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Main Content */}
      <main className="pt-16 min-h-screen flex flex-col">
        {!chatStarted ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">
            {/* Welcome Section */}
            <div className="animate-fade-in text-center max-w-2xl mx-auto">
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
                  <Sparkles className="w-4 h-4" />
                  <span>AI-Powered Development</span>
                </div>
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
                What can I help you build?
              </h1>
              
              <p className="text-lg lg:text-xl text-muted-foreground max-w-lg mx-auto mb-12">
                Describe your idea and watch it come to life. From simple components to full applications.
              </p>
              
              {/* Suggestion Cards */}
              <div className="flex flex-wrap gap-3 justify-center mb-8">
                {suggestionPrompts.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => setInput(text)}
                    className="group flex items-center gap-2.5 px-5 py-3 rounded-2xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-8">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`px-5 py-3 rounded-2xl max-w-[85%] ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-br-md' 
                        : 'bg-card border border-border rounded-bl-md'
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Area - Fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-8 pb-6 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Describe what you want to build..."
                className="w-full min-h-[56px] max-h-[200px] py-4 pl-5 pr-14 rounded-2xl border border-border bg-card shadow-xl shadow-background/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60"
                rows={1}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim()}
                className="absolute right-3 bottom-3 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground/60 mt-3">
              Bolt-Chef can make mistakes. Verify important information.
            </p>
          </div>
        </div>
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
