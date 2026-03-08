import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Save, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface LayerMapItem {
  layerName: string;
  excelColumn: string;
}

interface LayerMappingProps {
  templateId: number;
  textLayers: Array<{ name: string; text: string }>;
  excelHeaders: string[];
  onMappingComplete?: (mapping: Record<string, string>) => void;
}

export default function LayerMapping({
  templateId,
  textLayers,
  excelHeaders,
  onMappingComplete,
}: LayerMappingProps) {
  const [mappingName, setMappingName] = useState('');
  const [mappings, setMappings] = useState<LayerMapItem[]>([]);
  const [savedMappings, setSavedMappings] = useState<any[]>([]);
  const [selectedSavedMapping, setSelectedSavedMapping] = useState<number | null>(null);

  const saveMappingMutation = trpc.mapping.save.useMutation();
  const getMappingsQuery = trpc.mapping.list.useQuery({ templateId }, { enabled: false });

  // Initialize mappings for each text layer
  useEffect(() => {
    const initialMappings = textLayers.map(layer => ({
      layerName: layer.name,
      excelColumn: '',
    }));
    setMappings(initialMappings);
    loadSavedMappings();
  }, [textLayers]);

  const loadSavedMappings = async () => {
    try {
      // Use refetch to load mappings
      const result = await getMappingsQuery.refetch();
      if (result.data) {
        setSavedMappings(result.data);
      }
    } catch (error) {
      console.error('Failed to load saved mappings:', error);
    }
  };

  const handleMappingChange = (layerName: string, excelColumn: string) => {
    setMappings(prev =>
      prev.map(m => (m.layerName === layerName ? { ...m, excelColumn } : m))
    );
  };

  const handleSaveMapping = async () => {
    if (!mappingName.trim()) {
      toast.error('Please enter a mapping name');
      return;
    }

    const mappingObj = Object.fromEntries(
      mappings.map(m => [m.layerName, m.excelColumn])
    );

    try {
      await saveMappingMutation.mutateAsync({
        templateId,
        name: mappingName,
        mapping: mappingObj,
      });

      toast.success('Mapping saved successfully');
      setMappingName('');
      await loadSavedMappings();
      
      if (onMappingComplete) {
        onMappingComplete(mappingObj);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save mapping');
    }
  };

  const handleLoadMapping = (mapping: any) => {
    const parsedMapping = typeof mapping.mapping === 'string' 
      ? JSON.parse(mapping.mapping) 
      : mapping.mapping;

    setMappings(prev =>
      prev.map(m => ({
        ...m,
        excelColumn: parsedMapping[m.layerName] || '',
      }))
    );
    setSelectedSavedMapping(mapping.id as number);
    toast.success(`Loaded mapping: ${mapping.name}`);
  };

  const handleApplyMapping = () => {
    const mappingObj = Object.fromEntries(
      mappings.map(m => [m.layerName, m.excelColumn])
    );

    if (onMappingComplete) {
      onMappingComplete(mappingObj);
    }
  };

  const isValid = mappings.every(m => m.excelColumn);

  return (
    <div className="space-y-6">
      {/* Saved Mappings */}
      {savedMappings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Mappings</CardTitle>
            <CardDescription>Load a previously saved mapping configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedMappings.map(mapping => (
              <button
                key={mapping.id}
                onClick={() => handleLoadMapping(mapping)}
                className={`w-full text-left p-3 rounded-lg border-2 transition ${
                  selectedSavedMapping === (mapping.id as number)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-sm">{mapping.name}</p>
                <p className="text-xs text-slate-600">
                  Created {new Date(mapping.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Mapping Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configure Layer Mapping</CardTitle>
          <CardDescription>Map Excel columns to PSD text layers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mappings.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No text layers found in the PSD template</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {mappings.map(mapping => (
                <div key={mapping.layerName} className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-900 mb-1">
                      {mapping.layerName}
                    </label>
                    <Select value={mapping.excelColumn} onValueChange={(value) => handleMappingChange(mapping.layerName, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Excel column" />
                      </SelectTrigger>
                      <SelectContent>
                        {excelHeaders.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {mapping.excelColumn && (
                    <Badge className="bg-green-600">{mapping.excelColumn}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Save New Mapping */}
          <div className="border-t pt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">
                Save this mapping as
              </label>
              <Input
                placeholder="e.g., Diapers Size Variant"
                value={mappingName}
                onChange={(e) => setMappingName(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveMapping}
                disabled={!isValid || !mappingName.trim() || saveMappingMutation.isPending}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Mapping
              </Button>
              <Button
                onClick={handleApplyMapping}
                disabled={!isValid}
                variant="outline"
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                Use Mapping
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Status */}
      {!isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please map all text layers to Excel columns before proceeding
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
