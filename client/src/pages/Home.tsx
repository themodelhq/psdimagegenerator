import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { enterGuestMode, exitGuestMode, isGuestMode } from "@/hooks/useGuest";
import { Upload, FileText, Zap, Download, Search, Globe, Tag, UserX, LogIn } from "lucide-react";
import UploadInterface from "@/pages/UploadInterface";
import ProcessingDashboard from "@/pages/ProcessingDashboard";
import PreviewGallery from "@/pages/PreviewGallery";
import SingleProductEditor from "@/pages/SingleProductEditor";
import BulkUrlProcessor from "@/pages/BulkUrlProcessor";
import SkuLookup from "@/pages/SkuLookup";
import { useState, useEffect } from "react";

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [guestActive, setGuestActive] = useState(false);

  // Sync guest state on mount and any sessionStorage change
  useEffect(() => {
    setGuestActive(isGuestMode());
  }, []);

  const handleEnterGuest = () => {
    enterGuestMode();
    setGuestActive(true);
    // Force tRPC to refetch with the new guest header
    window.location.reload();
  };

  const handleExitGuest = () => {
    exitGuestMode();
    setGuestActive(false);
    window.location.reload();
  };

  // Show loading spinner briefly while auth resolves
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not signed in and not in guest mode → show login screen
  if (!isAuthenticated && !guestActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-800/80 backdrop-blur">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mx-auto mb-4 flex items-center justify-center">
              <Tag className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl text-white">Sticker Generator</CardTitle>
            <CardDescription className="text-slate-400">
              Generate product stickers from PSD templates &amp; Jumia data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50">
                <Upload className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-slate-300 text-xs">Upload PSD</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span className="font-medium text-slate-300 text-xs">Batch Process</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-700/50">
                <Download className="w-5 h-5 text-green-400" />
                <span className="font-medium text-slate-300 text-xs">Download</span>
              </div>
            </div>

            <Button
              onClick={() => window.location.href = getLoginUrl()}
              size="lg"
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In to Continue
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-800 px-2 text-slate-500">or</span>
              </div>
            </div>

            <Button
              onClick={handleEnterGuest}
              size="lg"
              variant="outline"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <UserX className="w-4 h-4 mr-2" />
              Continue as Guest
            </Button>

            <p className="text-xs text-center text-slate-500">
              Guest mode gives full access · Data is not saved between sessions
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated or guest → show the full app
  const displayName = isAuthenticated ? (user?.name || 'User') : 'Guest';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Guest banner */}
      {guestActive && !isAuthenticated && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <UserX className="w-4 h-4" />
            <span>
              You're using <strong>Guest mode</strong> — your data won't be saved between sessions.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => window.location.href = getLoginUrl()}
              className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            >
              <LogIn className="w-3 h-3 mr-1" /> Sign In
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExitGuest}
              className="h-7 text-xs text-amber-700 hover:bg-amber-100"
            >
              Exit Guest
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Tag className="w-5 h-5 text-white" />
              </span>
              Sticker Generator
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-slate-500 text-sm">Welcome, {displayName}</p>
              {guestActive && !isAuthenticated && (
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
                  Guest
                </Badge>
              )}
            </div>
          </div>
          {isAuthenticated && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = getLoginUrl()}
              className="text-xs"
            >
              <LogIn className="w-3 h-3 mr-1" /> Switch Account
            </Button>
          )}
        </div>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="upload" className="flex items-center gap-1.5 text-xs">
              <Upload className="w-3.5 h-3.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="single" className="flex items-center gap-1.5 text-xs">
              <Tag className="w-3.5 h-3.5" /> Single
            </TabsTrigger>
            <TabsTrigger value="processing" className="flex items-center gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" /> Batch
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-1.5 text-xs">
              <Globe className="w-3.5 h-3.5" /> URL Bulk
            </TabsTrigger>
            <TabsTrigger value="sku" className="flex items-center gap-1.5 text-xs">
              <Search className="w-3.5 h-3.5" /> SKU Lookup
            </TabsTrigger>
            <TabsTrigger value="gallery" className="flex items-center gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" /> Gallery
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-0">
            <UploadInterface />
          </TabsContent>
          <TabsContent value="single" className="mt-0">
            <SingleProductEditor />
          </TabsContent>
          <TabsContent value="processing" className="mt-0">
            <ProcessingDashboard />
          </TabsContent>
          <TabsContent value="bulk" className="mt-0">
            <BulkUrlProcessor />
          </TabsContent>
          <TabsContent value="sku" className="mt-0">
            <SkuLookup />
          </TabsContent>
          <TabsContent value="gallery" className="mt-0">
            <PreviewGallery />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
