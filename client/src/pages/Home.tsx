import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLoginUrl } from "@/const";
import { Upload, FileText, Zap, Download, Search, Globe, Tag } from "lucide-react";
import UploadInterface from "@/pages/UploadInterface";
import ProcessingDashboard from "@/pages/ProcessingDashboard";
import PreviewGallery from "@/pages/PreviewGallery";
import SingleProductEditor from "@/pages/SingleProductEditor";
import BulkUrlProcessor from "@/pages/BulkUrlProcessor";
import SkuLookup from "@/pages/SkuLookup";

export default function Home() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-800/80 backdrop-blur">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mx-auto mb-4 flex items-center justify-center">
              <Tag className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl text-white">Sticker Generator</CardTitle>
            <CardDescription className="text-slate-400">
              Generate product stickers from PSD templates & Jumia data
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
            <Button onClick={() => window.location.href = getLoginUrl()} size="lg" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              Sign In to Continue
            </Button>
            <p className="text-xs text-center text-slate-500">
              Supports Diapers PSD • Excel Batch • Jumia SKU Lookup • URL Bulk Update
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Tag className="w-5 h-5 text-white" />
              </span>
              Sticker Generator
            </h1>
            <p className="text-slate-500 mt-1 text-sm">Welcome, {user?.name || 'User'}</p>
          </div>
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
