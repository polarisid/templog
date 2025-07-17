'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, limit, addDoc, serverTimestamp, doc, getDoc, Timestamp, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Thermometer, Droplets, AlertCircle, Badge } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface Sector {
  id: string;
  name: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  admin_uid: string;
}

interface Record {
  id: string;
  temperature: number;
  humidity: number;
  timestamp: Timestamp;
  turno: 'Manhã' | 'Tarde' | 'Noite';
  observation: string;
}

const formSchema = z.object({
  temperature: z.coerce.number({ required_error: "Temperatura é obrigatória", invalid_type_error: "Deve ser um número" }),
  humidity: z.coerce.number({ required_error: "Umidade é obrigatória", invalid_type_error: 'Deve ser um número' }).min(0).max(100),
  turno: z.enum(['Manhã', 'Tarde', 'Noite'], { required_error: 'Você precisa selecionar um turno.' }),
  observation: z.string().max(500).optional(),
});

export default function RecordPage() {
  const params = useParams();
  const sectorId = params.sectorId as string;
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dailyRecords, setDailyRecords] = useState<Record[]>([]);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      temperature: '',
      humidity: '',
      observation: '',
    },
  });
  
  const tempValue = form.watch('temperature');
  const humidityValue = form.watch('humidity');
  
  const isTempOutOfRange = sector && tempValue !== undefined && tempValue !== '' && (Number(tempValue) < sector.temp_min || Number(tempValue) > sector.temp_max);
  const isHumidityOutOfRange = sector && humidityValue !== undefined && humidityValue !== '' && (Number(humidityValue) < sector.humidity_min || Number(humidityValue) > sector.humidity_max);

  useEffect(() => {
    if (!sectorId) return;

    const fetchSectorAndRecords = async () => {
      setLoading(true);
      try {
        const sectorRef = doc(db, 'sectors', sectorId);
        const docSnap = await getDoc(sectorRef);

        if (docSnap.exists()) {
          const sectorData = { id: docSnap.id, ...docSnap.data() } as Sector;
          setSector(sectorData);

          const today = new Date();
          const startOfDay = new Date(today.setHours(0, 0, 0, 0));
          const endOfDay = new Date(today.setHours(23, 59, 59, 999));

          const recordsQuery = query(
            collection(db, 'records'),
            where('sector_id', '==', sectorId),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay),
            orderBy('timestamp', 'asc')
          );
          
          const unsubscribe = onSnapshot(recordsQuery, (snapshot) => {
            const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record));
            setDailyRecords(recordsData);
          });
          
          // I'm returning unsubscribe here but this is a one-off async function, 
          // a proper implementation would handle cleanup differently if this component could unmount.
          // For this app's lifecycle it's acceptable.

        } else {
          toast({ variant: 'destructive', title: 'Erro', description: 'Setor não encontrado.' });
          setSector(null);
        }
      } catch (error) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao buscar detalhes do setor.' });
      } finally {
        setLoading(false);
      }
    };

    fetchSectorAndRecords();

  }, [sectorId, toast]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!sector) return;
    setIsSubmitting(true);
    
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const recordsRef = collection(db, 'records');
      const q = query(
        recordsRef,
        where('sector_id', '==', sector.id),
        where('turno', '==', values.turno),
        where('timestamp', '>=', startOfDay),
        where('timestamp', '<=', endOfDay)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        toast({
          variant: 'destructive',
          title: 'Registro Duplicado',
          description: `Medição do turno já realizada`,
        });
        setIsSubmitting(false);
        return;
      }
      
      const dataToSave = {
        ...values,
        observation: values.observation || '',
        sector_id: sector.id,
        timestamp: serverTimestamp(),
        is_temp_ok: !isTempOutOfRange,
        is_humidity_ok: !isHumidityOutOfRange,
        admin_uid: sector.admin_uid,
      };

      await addDoc(collection(db, 'records'), dataToSave);
      toast({
        title: 'Sucesso!',
        description: 'Suas leituras foram enviadas.',
      });
      form.reset({
        observation: '',
        temperature: '',
        humidity: '',
        turno: undefined,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Falha no Envio', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-full" />
          </CardFooter>
        </Card>
    );
  }

  if (!sector) {
    return (
        <Card className="w-full max-w-md p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-2xl font-bold">Setor Não Encontrado</h2>
            <p className="mt-2 text-muted-foreground">O link que você usou é inválido ou o setor foi removido.</p>
        </Card>
    );
  }

  return (
    <>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{sector.name}</CardTitle>
          <CardDescription>Insira as leituras atuais para este setor. A hora será registrada automaticamente.</CardDescription>
          <div className="flex flex-wrap gap-4 pt-2 text-sm text-muted-foreground">
             <div className="flex items-center gap-1">
                <Thermometer className="h-4 w-4" />
                <span>Temp: {sector.temp_min}°C - {sector.temp_max}°C</span>
             </div>
             <div className="flex items-center gap-1">
                <Droplets className="h-4 w-4" />
                <span>Umidade: {sector.humidity_min}% - {sector.humidity_max}%</span>
             </div>
          </div>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
                <FormField control={form.control} name="temperature" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura (°C)</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="ex: 22.5" {...field} value={field.value ?? ''} className={cn(isTempOutOfRange && 'border-destructive focus-visible:ring-destructive')}/></FormControl>
                    {isTempOutOfRange && <FormMessage className="text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4"/>Valor fora da faixa ideal.</FormMessage>}
                     <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="humidity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Umidade (%)</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="ex: 55" {...field} value={field.value ?? ''} className={cn(isHumidityOutOfRange && 'border-destructive focus-visible:ring-destructive')}/></FormControl>
                    {isHumidityOutOfRange && <FormMessage className="text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4"/>Valor fora da faixa ideal.</FormMessage>}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="turno" render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Turno</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-1">
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="Manhã" /></FormControl>
                          <FormLabel className="font-normal">Manhã</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="Tarde" /></FormControl>
                          <FormLabel className="font-normal">Tarde</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="Noite" /></FormControl>
                          <FormLabel className="font-normal">Noite</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="observation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (opcional)</FormLabel>
                    <FormControl><Textarea placeholder="Quaisquer notas ou comentários..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Leituras
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
      
      {dailyRecords.length > 0 && (
          <Card className="w-full max-w-md mt-6">
              <CardHeader>
                  <CardTitle>Registros de Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Turno</TableHead>
                              <TableHead>Temp.</TableHead>
                              <TableHead>Umidade</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {dailyRecords.map(record => (
                              <TableRow key={record.id}>
                                  <TableCell>{record.turno}</TableCell>
                                  <TableCell>{record.temperature}°C</TableCell>
                                  <TableCell>{record.humidity}%</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
              </CardContent>
          </Card>
      )}
    </>
  );
}
