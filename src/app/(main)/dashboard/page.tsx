'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, deleteDoc, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Building2, PlusCircle, Loader2, MoreHorizontal, Trash2, Copy, Eye, Edit } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewRecordsDialog } from '@/components/dashboard/view-records-dialog';
import { useAuth } from '@/context/auth-context';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface Sector {
  id: string;
  name: string;
  location: string;
  responsible_name: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  admin_uid: string;
}

interface Record {
    id: string;
    sector_id: string;
    turno: 'Manhã' | 'Tarde' | 'Noite';
    timestamp: Timestamp;
}

interface SectorStatus {
    [sectorId: string]: {
        name: string;
        shifts: {
            'Manhã': boolean;
            'Tarde': boolean;
            'Noite': boolean;
        }
    }
}

const sectorSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  location: z.string().min(1, 'A localização é obrigatória'),
  responsible_name: z.string().min(1, 'O nome do responsável é obrigatório'),
  temp_min: z.coerce.number(),
  temp_max: z.coerce.number(),
  humidity_min: z.coerce.number().min(0).max(100),
  humidity_max: z.coerce.number().min(0).max(100),
}).refine(data => data.temp_max > data.temp_min, {
  message: "A temperatura máxima deve ser maior que a mínima",
  path: ["temp_max"],
}).refine(data => data.humidity_max > data.humidity_min, {
  message: "A umidade máxima deve ser maior que a mínima",
  path: ["humidity_max"],
});

const defaultFormValues = {
  name: '',
  location: '',
  responsible_name: '',
  temp_min: 18,
  temp_max: 25,
  humidity_min: 40,
  humidity_max: 60,
};

export default function DashboardPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sectorForRecords, setSectorForRecords] = useState<Sector | null>(null);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [isRecordsDialogOpen, setIsRecordsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [sectorsStatus, setSectorsStatus] = useState<SectorStatus>({});
  const [loadingStatus, setLoadingStatus] = useState(true);


  useEffect(() => {
    if (!user) {
      setLoading(false);
      setLoadingStatus(false);
      setSectors([]);
      return;
    }
    setLoading(true);
    const qSectors = query(collection(db, 'sectors'), where('admin_uid', '==', user.uid));

    const unsubscribeSectors = onSnapshot(qSectors, (querySnapshot) => {
      const sectorsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sector));
      setSectors(sectorsData);

      const initialStatus: SectorStatus = {};
      sectorsData.forEach(sector => {
          initialStatus[sector.id] = {
              name: sector.name,
              shifts: { 'Manhã': false, 'Tarde': false, 'Noite': false }
          };
      });
      setSectorsStatus(initialStatus);
      setLoading(false);
      
      if (sectorsData.length > 0) {
        setLoadingStatus(true);
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        
        const unsubscribes: (() => void)[] = [];

        sectorsData.forEach(sector => {
            const qRecords = query(
                collection(db, 'records'),
                where('sector_id', '==', sector.id),
                where('timestamp', '>=', startOfDay),
                where('timestamp', '<=', endOfDay)
            );

            const unsubscribe = onSnapshot(qRecords, (recordsSnapshot) => {
                setSectorsStatus(prevStatus => {
                    const newStatus = { ...prevStatus };
                    
                    if (newStatus[sector.id]) {
                      newStatus[sector.id].shifts = { 'Manhã': false, 'Tarde': false, 'Noite': false };
                    }

                    recordsSnapshot.docs.forEach(doc => {
                        const record = doc.data() as Record;
                        if (newStatus[record.sector_id]) {
                            newStatus[record.sector_id].shifts[record.turno] = true;
                        }
                    });
                    
                    return newStatus;
                });
            });
            unsubscribes.push(unsubscribe);
        });

        setLoadingStatus(false);

        return () => unsubscribes.forEach(unsub => unsub());

      } else {
        setLoadingStatus(false);
      }

    }, (error) => {
      console.error("Erro ao buscar setores: ", error);
      toast({ variant: 'destructive', title: 'Erro ao buscar setores', description: error.message });
      setLoading(false);
      setLoadingStatus(false);
    });

    return () => unsubscribeSectors();
  }, [user, toast]);

  const handleFormOpenChange = (open: boolean) => {
    if (!open) {
      setEditingSector(null);
      form.reset(defaultFormValues);
    }
    setIsFormOpen(open);
  }

  const handleEditClick = (sector: Sector) => {
    setEditingSector(sector);
    form.reset(sector);
    setIsFormOpen(true);
  };

  const form = useForm<z.infer<typeof sectorSchema>>({
    resolver: zodResolver(sectorSchema),
    defaultValues: defaultFormValues,
  });

  const onSubmit = async (values: z.infer<typeof sectorSchema>) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Você precisa estar logado para realizar esta ação.' });
        return;
    }
    setIsSubmitting(true);
    try {
      if (editingSector) {
        const sectorRef = doc(db, 'sectors', editingSector.id);
        await updateDoc(sectorRef, { ...values, admin_uid: user.uid });
        toast({ title: 'Sucesso', description: 'Setor atualizado com sucesso.' });
      } else {
        await addDoc(collection(db, 'sectors'), { ...values, admin_uid: user.uid });
        toast({ title: 'Sucesso', description: 'Setor adicionado com sucesso.' });
      }
      form.reset(defaultFormValues);
      handleFormOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const deleteSector = async (sectorId: string) => {
    try {
      const recordsQuery = query(collection(db, 'records'), where('sector_id', '==', sectorId));
      const recordsSnapshot = await getDocs(recordsQuery);
      const deletePromises = recordsSnapshot.docs.map(recordDoc => deleteDoc(doc(db, 'records', recordDoc.id)));
      await Promise.all(deletePromises);
      
      await deleteDoc(doc(db, 'sectors', sectorId));
      toast({ title: 'Sucesso', description: 'Setor e todos os seus registros foram deletados.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao deletar setor', description: error.message });
    }
  };
  
  const copyLink = (sectorId: string) => {
    const url = `${window.location.origin}/record/${sectorId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copiado!', description: 'O link para registro neste setor foi copiado.' });
  };
  
  const handleViewRecords = (sector: Sector) => {
    setSectorForRecords(sector);
    setIsRecordsDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Painel de Setores</h2>
          <p className="text-muted-foreground">Gerencie seus setores de monitoramento aqui.</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={handleFormOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Novo Setor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingSector ? 'Editar Setor' : 'Adicionar Novo Setor'}</DialogTitle>
              <DialogDescription>
                {editingSector ? 'Atualize os detalhes para este setor.' : 'Preencha os detalhes para o novo setor.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Setor</FormLabel>
                    <FormControl><Input placeholder="ex: Laboratório Principal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização</FormLabel>
                    <FormControl><Input placeholder="ex: Prédio A, 2º Andar" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="responsible_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl><Input placeholder="ex: Dr. Silva" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="temp_min" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Temp. Mínima (°C)</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="temp_max" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Temp. Máxima (°C)</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="humidity_min" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Umidade Mínima (%)</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="humidity_max" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Umidade Máxima (%)</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingSector ? 'Salvar Alterações' : 'Adicionar Setor'}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

       <Card>
          <CardHeader>
            <CardTitle>Status das Medições de Hoje</CardTitle>
            <CardDescription>Acompanhe os registros de temperatura e umidade para cada setor e turno.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStatus ? (
                 Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="mb-4 p-4 border rounded-lg">
                        <Skeleton className="h-6 w-1/2 mb-3" />
                        <div className="flex gap-4">
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-6 w-24" />
                        </div>
                    </div>
                 ))
            ) : Object.keys(sectorsStatus).length > 0 ? (
                <div className="space-y-4">
                {Object.entries(sectorsStatus).map(([sectorId, status]) => (
                    <div key={sectorId} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg mb-2">{status.name}</h3>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(status.shifts).map(([shift, done]) => (
                                <Badge key={shift} className={cn('text-white', done ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600')}>
                                    {shift}: {done ? 'Realizado' : 'Pendente'}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ))}
                </div>
            ) : (
                 <div className="text-center text-muted-foreground p-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2" />
                    Nenhum setor cadastrado para exibir o status.
                </div>
            )}
          </CardContent>
       </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seus Setores</CardTitle>
          <CardDescription>Uma lista de todos os setores registrados em sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Localização</TableHead>
                <TableHead className="hidden sm:table-cell">Faixa de Temp.</TableHead>
                <TableHead className="hidden sm:table-cell">Faixa de Umidade</TableHead>
                <TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : sectors.length > 0 ? (
                sectors.map((sector) => (
                  <TableRow key={sector.id}>
                    <TableCell className="font-medium">{sector.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{sector.location}</TableCell>
                    <TableCell className="hidden sm:table-cell">{`${sector.temp_min}°C - ${sector.temp_max}°C`}</TableCell>
                    <TableCell className="hidden sm:table-cell">{`${sector.humidity_min}% - ${sector.humidity_max}%`}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem onClick={() => handleViewRecords(sector)} className="cursor-pointer">
                            <Eye className="mr-2 h-4 w-4" /> Ver Registros
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditClick(sector)} className="cursor-pointer">
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyLink(sector.id)} className="cursor-pointer">
                            <Copy className="mr-2 h-4 w-4" /> Copiar Link
                          </DropdownMenuItem>
                          <AlertDialog>
                             <AlertDialogTrigger asChild>
                               <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40 cursor-pointer">
                                 <Trash2 className="mr-2 h-4 w-4" /> Deletar
                               </DropdownMenuItem>
                             </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Essa ação não pode ser desfeita. Isso excluirá permanentemente o setor
                                  e todos os seus registros associados.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSector(sector.id)} className="bg-destructive hover:bg-destructive/90">
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8" />
                      Nenhum setor encontrado. Comece adicionando um.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {sectorForRecords && (
        <ViewRecordsDialog 
          isOpen={isRecordsDialogOpen} 
          setIsOpen={setIsRecordsDialogOpen} 
          sector={sectorForRecords}
        />
      )}

    </div>
  );
}
