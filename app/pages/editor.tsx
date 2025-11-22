import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { EditorPane } from '@/components/editor/editor-pane';
import { PreviewPane } from '@/components/preview/preview-pane';
import { ChatInterface } from '@/components/chat/chat-interface';
import { FileManager } from '@/components/file-manager/file-manager';
import { TerminalPane } from '@/components/terminal/terminal-pane';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PanelLeftClose, PanelLeftOpen, MessageSquare, Terminal } from 'lucide-react';

export function EditorPage() {
  const { projectId } = useParams();
  const [showFileManager, setShowFileManager] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);

  return (
    <div className="flex h-full flex-col">
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15}>
          <div className="flex h-full border-r border-border/40">
            {showFileManager && (
              <div className="h-full w-full overflow-auto">
                <FileManager />
              </div>
            )}
            {!showFileManager && (
              <div className="flex h-full w-10 items-center justify-center border-r border-border/40">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFileManager(true)}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-2 bg-border/40" />

        <Panel defaultSize={60} minSize={30}>
          <div className="flex h-full flex-col">
            <PanelGroup direction="vertical" className="flex-1">
              <Panel defaultSize={isPreviewVisible ? 100 : 70} minSize={30}>
                <div className="flex-1 overflow-hidden">
                  <EditorPane />
                </div>
              </Panel>

              {showTerminal && (
                <>
                  <PanelResizeHandle className="h-2 bg-border/40" />
                  <Panel defaultSize={30} minSize={20}>
                    <div className="border-t border-border/40 h-full">
                      <TerminalPane />
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>

            <div className="flex gap-2 border-t border-border/40 p-2">
              <Button
                variant={showChat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowChat(!showChat)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </Button>
              <Button
                variant={showTerminal ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTerminal(!showTerminal)}
              >
                <Terminal className="mr-2 h-4 w-4" />
                Terminal
              </Button>
              <div className="flex-1" />
              <Button
                variant={isPreviewVisible ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsPreviewVisible(!isPreviewVisible)}
              >
                {isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
              </Button>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-2 bg-border/40" />

        <Panel defaultSize={20} minSize={15}>
          <div className="flex h-full border-l border-border/40">
            {isPreviewVisible && (
              <div className="flex-1">
                <PreviewPane />
              </div>
            )}

            {showChat && !isPreviewVisible && (
              <div className="flex-1">
                <ChatInterface />
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {showChat && (
        <div className="border-t border-border/40 h-64">
          <ChatInterface />
        </div>
      )}
    </div>
  );
}
